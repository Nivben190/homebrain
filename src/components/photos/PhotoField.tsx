"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, ChevronLeft, ChevronRight, FileText, ImagePlus, Paperclip, ScanLine, Trash2, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { deleteAttachment, uploadAttachment, usePhotoUrls, type Photo, type UploadTarget } from "@/lib/photos";
import { Spinner } from "@/components/ui";

type Source = "camera" | "scan" | "library" | "file";

/** Photos / receipt scans / PDFs on an item, with add menu and full-screen viewer. */
export function PhotoField({ photos, target, onChange }: { photos: Photo[]; target: UploadTarget; onChange: (photos: Photo[]) => void }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const inputs = { camera: useRef<HTMLInputElement>(null), scan: useRef<HTMLInputElement>(null), library: useRef<HTMLInputElement>(null), file: useRef<HTMLInputElement>(null) };
  const urls = usePhotoUrls(photos.flatMap((p) => [p.thumb ?? p.path, p.path]));

  async function add(files: FileList | null, scan: boolean) {
    if (!files?.length) return;
    setMenu(false);
    setError(null);
    setUploading(files.length);
    let next = photos;
    for (const file of Array.from(files)) {
      try {
        next = [...next, await uploadAttachment(target, file, { scan })];
        onChange(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      setUploading((n) => n - 1);
    }
  }

  async function remove(i: number) {
    const photo = photos[i];
    onChange(photos.filter((_, j) => j !== i));
    setViewer(null);
    await deleteAttachment(photo);
  }

  const options: { key: Source; icon: React.ReactNode; label: string }[] = [
    { key: "camera", icon: <Camera className="size-5" />, label: t.photos.camera },
    { key: "scan", icon: <ScanLine className="size-5" />, label: t.photos.scan },
    { key: "library", icon: <ImagePlus className="size-5" />, label: t.photos.library },
    { key: "file", icon: <Paperclip className="size-5" />, label: t.photos.file },
  ];

  return (
    <div>
      {/* Hidden pickers. capture=environment opens the rear camera directly on iPhone. */}
      <input ref={inputs.camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(e.target.files, false), (e.target.value = ""))} />
      <input ref={inputs.scan} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(e.target.files, true), (e.target.value = ""))} />
      <input ref={inputs.library} type="file" accept="image/*" multiple hidden onChange={(e) => (add(e.target.files, false), (e.target.value = ""))} />
      <input ref={inputs.file} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (add(e.target.files, false), (e.target.value = ""))} />

      <div className="grid grid-cols-4 gap-2">
        {photos.map((p, i) => (
          <button key={p.path} type="button" onClick={() => (p.kind === "pdf" ? urls[p.path] && window.open(urls[p.path], "_blank") : setViewer(i))} className="relative aspect-square overflow-hidden rounded-2xl bg-sunken">
            {p.kind === "pdf" ? (
              <span className="flex h-full flex-col items-center justify-center gap-1 text-muted">
                <FileText className="size-7" />
                <span className="w-full truncate px-1 text-[10px] font-semibold">{p.name ?? "PDF"}</span>
              </span>
            ) : urls[p.thumb ?? p.path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[p.thumb ?? p.path]} alt="" className="size-full object-cover" loading="lazy" />
            ) : null}
          </button>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`u${i}`} className="flex aspect-square items-center justify-center rounded-2xl bg-sunken text-muted">
            <Spinner />
          </div>
        ))}
        <button type="button" onClick={() => setMenu((m) => !m)} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-faint-deco text-muted transition active:scale-95">
          <Camera className="size-6" />
          <span className="text-[11px] font-semibold">{t.photos.add}</span>
        </button>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-2 grid grid-cols-2 gap-2">
            {options.map((o) => (
              <button key={o.key} type="button" onClick={() => inputs[o.key].current?.click()} className="flex items-center gap-2 rounded-2xl bg-sunken px-3 py-3 text-sm font-semibold transition active:scale-95">
                <span className="text-accent">{o.icon}</span> {o.label}
              </button>
            ))}
            <p className="col-span-2 px-1 text-xs text-faint">{t.photos.hint}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <Lightbox photos={photos.filter((p) => p.kind === "image")} urls={urls} index={viewer === null ? null : photos.filter((p) => p.kind === "image").indexOf(photos[viewer])} onClose={() => setViewer(null)} onDelete={(p) => remove(photos.indexOf(p))} />
    </div>
  );
}

export function Lightbox({ photos, urls, index, onClose, onDelete }: { photos: Photo[]; urls: Record<string, string>; index: number | null; onClose: () => void; onDelete?: (p: Photo) => void }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  if (index !== lastIndex) {
    setLastIndex(index);
    if (index !== null) setI(index);
  }
  const photo = index !== null ? photos[i] : null;
  return (
    <AnimatePresence>
      {photo && (
        <motion.div className="fixed inset-0 z-[70] flex flex-col bg-black/95" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="safe-top flex items-center justify-between px-4 pb-2 text-white">
            <button onClick={onClose} aria-label={t.common.close} className="flex size-10 items-center justify-center rounded-full bg-white/10">
              <X className="size-5" />
            </button>
            <span className="text-sm font-semibold">
              {i + 1} / {photos.length}
            </span>
            {onDelete ? (
              <button onClick={() => onDelete(photo)} aria-label={t.common.delete} className="flex size-10 items-center justify-center rounded-full bg-white/10">
                <Trash2 className="size-5" />
              </button>
            ) : (
              <span className="size-10" />
            )}
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center" dir="ltr">
            {urls[photo.path] ? (
               
              <motion.img key={photo.path} src={urls[photo.path]} alt="" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="max-h-full max-w-full object-contain" />
            ) : (
              <Spinner className="text-white" />
            )}
            {photos.length > 1 && (
              <>
                <button onClick={() => setI((i - 1 + photos.length) % photos.length)} aria-label={t.common.previous} className="absolute left-3 flex size-11 items-center justify-center rounded-full bg-white/15 text-white">
                  <ChevronLeft className="size-6" />
                </button>
                <button onClick={() => setI((i + 1) % photos.length)} aria-label={t.common.next} className="absolute right-3 flex size-11 items-center justify-center rounded-full bg-white/15 text-white">
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          <div className="safe-bottom h-4" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
