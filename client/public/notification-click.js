// Added to the generated service worker (see vite.config.ts).
// Tapping a reminder brings the app to the front, or opens it if it was closed.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
