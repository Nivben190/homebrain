"use client";
import { savePushSubscription } from "@/app/actions";

export type PushState = "unsupported" | "needs-install" | "default" | "denied" | "granted";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  // iOS only exposes Web Push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) void stillHere(sub);
    return sub ? "granted" : "default";
  }
  return "default";
}

const SEEN_KEY = "hb_push_seen";

/**
 * Once a day, tells the server this device still opens the app; devices unseen for
 * 60 days are pruned (roadmap 1.10). Also re-sends keys the browser may have rotated.
 */
async function stillHere(sub: PushSubscription) {
  const today = new Date().toDateString();
  try {
    if (localStorage.getItem(SEEN_KEY) === today) return;
    localStorage.setItem(SEEN_KEY, today);
  } catch {
    // storage blocked: checking in on every open is fine
  }
  await savePushSubscription(sub.toJSON(), deviceLabel()).catch(() => {});
}

function deviceLabel() {
  return isIos() ? "iPhone" : navigator.platform || "Device";
}

/** Must run from a tap (iOS requires a user gesture for the permission prompt). */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    }));
  const res = await savePushSubscription(sub.toJSON(), deviceLabel());
  return res.ok ? "granted" : "default";
}
