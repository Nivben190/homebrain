"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, Undo2, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

// One feedback system (roadmap 2.11): every save, failure and undo shows here,
// in the same place and the same look.

type Kind = "success" | "error" | "undo";
interface Toast {
  id: string;
  kind: Kind;
  text: string;
  detail?: string;
  action?: () => void;
}
interface ToastApi {
  success(text: string): void;
  /** With `retry`, the toast offers Retry and stays until tapped or closed. */
  error(text: string, retry?: () => void, id?: string): void;
  undo(text: string, onUndo: () => void, detail?: string): void;
  dismiss(id: string): void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast() {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast outside <Toaster>");
  return api;
}

const LIFETIME: Record<Kind, number> = { success: 2000, error: 5000, undo: 5000 };

export function Toaster({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (toast: Toast, sticky = false) => {
      clearTimeout(timers.current.get(toast.id));
      setToasts((all) => [...all.filter((x) => x.id !== toast.id), toast].slice(-3));
      if (!sticky) timers.current.set(toast.id, setTimeout(() => dismiss(toast.id), LIFETIME[toast.kind]));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => show({ id: crypto.randomUUID(), kind: "success", text }),
      error: (text, retry, id) => show({ id: id ?? crypto.randomUUID(), kind: "error", text, action: retry }, !!retry),
      undo: (text, onUndo, detail) => show({ id: "undo", kind: "undo", text, detail, action: onUndo }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+6rem)] z-[60] mx-auto flex max-w-md flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((x) => (
            <motion.div
              key={x.id}
              layout
              role={x.kind === "error" ? "alert" : "status"}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-2xl py-2 pe-2 ps-4 shadow-xl",
                x.kind === "error" ? "bg-danger text-white" : "bg-fg text-bg",
              )}
            >
              <span className="min-w-0 flex-1 py-1.5 text-sm font-semibold">
                <span className="block truncate">{x.kind === "success" ? `✓ ${x.text}` : x.text}</span>
                {x.detail && <span className="block text-xs font-medium opacity-70">{x.detail}</span>}
              </span>
              {x.action && (
                <button
                  onClick={() => {
                    dismiss(x.id);
                    x.action!();
                  }}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white/20 px-3 text-sm font-bold"
                >
                  {x.kind === "undo" ? <Undo2 className="size-4" /> : <RotateCcw className="size-4" />}
                  {x.kind === "undo" ? t.sections.undo : t.sections.retry}
                </button>
              )}
              {x.kind !== "success" && (
                <button onClick={() => dismiss(x.id)} aria-label={t.common.cancel} className="flex size-9 shrink-0 items-center justify-center rounded-xl">
                  <X className="size-4" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
