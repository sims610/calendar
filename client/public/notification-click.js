// Added to the generated service worker (see vite.config.ts).
// Shows reminders the server sends as push messages, which arrive even when the app is closed,
// and brings the app to the front (or opens it) when one is tapped.
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Calendar", {
      body: data.body,
      // The app's calendar icon, resolved against the service worker's scope.
      icon: new URL("icon.svg", self.registration.scope).href,
      // Replaces an earlier notification for the same event instead of stacking up.
      tag: data.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
