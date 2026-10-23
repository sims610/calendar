import { useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/** How often to look for a new version while the app stays open. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker, so the app can be installed and opens offline, and shows a
 * notice at the bottom when a new version has downloaded. The new version only takes over
 * when the user taps Reload.
 */
export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) {
        return;
      }
      registrationRef.current = registration;
      // An installed app can stay open for days, so check now and then, and whenever it's
      // brought back to the front, instead of only when it's first opened.
      setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update();
        }
      });
    },
  });

  const reload = () => {
    // The plugin reloads once the new version takes control of this page. A page no version
    // controls yet (the very first visit, or after a hard refresh) never gets that signal,
    // so reload it ourselves as soon as the new version is active.
    const waiting = registrationRef.current?.waiting;
    if (waiting && !navigator.serviceWorker.controller) {
      waiting.addEventListener("statechange", () => {
        if (waiting.state === "activated") {
          window.location.reload();
        }
      });
    }
    updateServiceWorker();
  };

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="update-toast" role="status">
      <span>A new version of Calendar is available</span>
      <button type="button" className="update-toast-button" onClick={reload}>
        Refresh
      </button>
    </div>
  );
}
