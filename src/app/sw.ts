import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Pages that can't load without a connection show the precached offline screen.
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

// Brain notifications: payload is { title, body, url } from src/lib/push.ts
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "Home Brain", body: "", url: "/" };
  // Home Screen badge (iOS 16.4+ installed apps): how many cards wait for an answer.
  if (typeof data.badge === "number" && "setAppBadge" in self.navigator) void self.navigator.setAppBadge(data.badge).catch(() => {});
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/192",
      badge: "/icons/96",
      data: { url: data.url },
      tag: data.url,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (w.url === url) {
          await w.focus();
          return;
        }
      }
      // navigate() rejects (or returns null) for windows this worker doesn't
      // control; fall back to opening a new one so the tap never goes nowhere.
      for (const w of windows) {
        try {
          const moved = await w.navigate(url);
          if (moved) {
            await moved.focus();
            return;
          }
        } catch {
          // try the next window
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
