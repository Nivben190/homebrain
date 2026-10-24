"use client";
// Photos, receipt scans and PDFs attached to items (props._photos).
// Images are resized on the phone before upload (fast on mobile data, tiny
// storage); a small thumbnail is stored next to each for quick grids.
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const PHOTOS_PROP = "_photos";
const BUCKET = "attachments";

export interface Photo {
  path: string;
  thumb?: string;
  kind: "image" | "pdf";
  name?: string;
}

export function readPhotos(props: Record<string, unknown>): Photo[] {
  const v = props[PHOTOS_PROP];
  return Array.isArray(v) ? (v.filter((p) => p && typeof p.path === "string") as Photo[]) : [];
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // The decoded image stays usable after revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Resize to `max` px on the long side and re-encode as JPEG. `scan` turns a
 * photo of a receipt/document into a clean, high-contrast black & white page.
 */
async function render(img: HTMLImageElement, max: number, quality: number, scan: boolean): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  if (scan) {
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    // Grayscale, then stretch contrast around a paper-white threshold.
    for (let i = 0; i < px.length; i += 4) {
      const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const v = Math.max(0, Math.min(255, (y - 90) * 1.9));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
}

/** A phone photo shrunk for sending (e.g. a fridge scan). */
export async function resizeImage(file: Blob, max: number): Promise<Blob> {
  return render(await loadImage(file), max, 0.82, false);
}

export interface UploadTarget {
  householdId: string;
  sectionId: string;
  itemId: string;
}

export async function uploadAttachment(target: UploadTarget, file: File, opts: { scan?: boolean } = {}): Promise<Photo> {
  const sb = supabaseBrowser();
  const base = `${target.householdId}/${target.sectionId}/${target.itemId}/${crypto.randomUUID()}`;

  if (file.type === "application/pdf") {
    const path = `${base}.pdf`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
    if (error) throw error;
    return { path, kind: "pdf", name: file.name };
  }

  const img = await loadImage(file);
  const [full, small] = await Promise.all([render(img, 1600, 0.82, !!opts.scan), render(img, 480, 0.75, !!opts.scan)]);
  const path = `${base}.jpg`;
  const thumb = `${base}_t.jpg`;
  const results = await Promise.all([
    sb.storage.from(BUCKET).upload(path, full, { contentType: "image/jpeg" }),
    sb.storage.from(BUCKET).upload(thumb, small, { contentType: "image/jpeg" }),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  return { path, thumb, kind: "image" };
}

export async function deleteAttachment(photo: Photo) {
  await supabaseBrowser()
    .storage.from(BUCKET)
    .remove([photo.path, ...(photo.thumb ? [photo.thumb] : [])]);
}

// ---------------------------------------------------------------------------
// Signed URLs (private bucket), batched and cached across components
// ---------------------------------------------------------------------------

const TTL = 60 * 60; // seconds
const cache = new Map<string, { url: string; exp: number }>();

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  // Re-sign anything missing or expiring within a minute.
  const missing = [...new Set(paths)].filter((p) => (cache.get(p)?.exp ?? 0) < now + 60000);
  if (missing.length) {
    const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrls(missing, TTL);
    for (const d of data ?? []) if (d.signedUrl && d.path) cache.set(d.path, { url: d.signedUrl, exp: now + TTL * 1000 });
  }
  return Object.fromEntries(paths.map((p) => [p, cache.get(p)?.url ?? ""]));
}

/** Signed URLs for a set of storage paths; re-resolves when the set changes. */
export function usePhotoUrls(paths: string[]): Record<string, string> {
  const key = [...new Set(paths)].sort().join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    signedUrls(key.split("|")).then((u) => alive && setUrls(u));
    return () => {
      alive = false;
    };
  }, [key]);
  return urls;
}
