"use client";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/i18n/client";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "soft" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg shadow-[0_8px_20px_-6px_var(--accent)] active:shadow-none",
  soft: "bg-accent-soft text-accent",
  ghost: "bg-sunken text-fg",
  danger: "bg-danger/12 text-danger",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "lg" | "sm"; loading?: boolean }
>(function Button({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.97] disabled:opacity-50",
        size === "lg" && "h-14 px-6 text-base",
        size === "md" && "h-11 px-4 text-[15px]",
        size === "sm" && "h-8 rounded-xl px-3 text-sm",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn("inline-flex size-10 items-center justify-center rounded-full bg-sunken text-fg transition active:scale-90", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass rounded-3xl p-4", className)} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; back?: ReactNode }) {
  return (
    <header className="safe-top mb-4 flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-[32px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const fieldBase =
  "w-full rounded-2xl border border-card-border bg-card-solid px-4 text-fg placeholder:text-faint outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldBase, "h-12", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-3", className)} {...props} />;
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "h-12 appearance-none", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-sm font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block px-1 text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-8 w-[52px] shrink-0 rounded-full transition-colors", checked ? "bg-success" : "bg-sunken")}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className={cn("absolute top-1 size-6 rounded-full bg-white shadow", checked ? "end-1" : "start-1")}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-2xl bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold"
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-xl bg-card-solid shadow-soft" />
          )}
          <span className={cn("relative", value === o.value ? "text-fg" : "text-muted")}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold transition active:scale-95",
        active ? "bg-accent text-accent-fg" : "bg-sunken text-muted",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

/**
 * Bottom sheet. Only the top handle/title drags it closed, so the body scrolls
 * normally on iPhone; `footer` stays pinned (e.g. a Save button).
 */
export function Sheet({
  open,
  onClose,
  title,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const drag = useDragControls();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            className={cn(
              "absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] max-w-lg flex-col rounded-t-[2rem] bg-card-solid shadow-2xl",
              !footer && "safe-bottom",
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            {/* Drag handle: the only place a swipe moves the sheet. */}
            <div className="shrink-0 touch-none px-5 pt-3" onPointerDown={(e) => drag.start(e)}>
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-sunken" />
              {title && (
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold">{title}</h3>
                  <IconButton onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Close" className="size-8">
                    <X className="size-4" />
                  </IconButton>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>
            {footer && <div className="safe-bottom shrink-0 border-t border-card-border bg-card-solid px-5 pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

export const EMOJIS = [
  "🏠", "🛒", "✅", "📝", "💡", "❤️", "💌", "🧘", "🏋️", "🐶", "🦴", "🍳", "🧹", "🛠️", "🪴", "💼",
  "📈", "💰", "🎁", "✈️", "🎬", "📚", "🎵", "☀️", "🌙", "⏰", "📅", "🧠", "⚡", "🌟", "🎯", "🍷",
];

/** First emoji (grapheme) in a string, so typing "🐕 dog" keeps just 🐕. */
function firstGrapheme(text: string): string {
  const seg = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const first = seg ? seg.segment(text.trim())[Symbol.iterator]().next().value?.segment : [...text.trim()][0];
  return first ?? "";
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const custom = !EMOJIS.includes(value);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-1.5">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            className={cn("flex aspect-square items-center justify-center rounded-xl text-xl transition active:scale-90", value === e ? "bg-accent-soft ring-2 ring-accent" : "bg-sunken")}
          >
            {e}
          </button>
        ))}
      </div>
      {/* Any emoji from the phone's emoji keyboard */}
      <label className="flex items-center gap-2 rounded-xl bg-sunken px-3">
        <span className={cn("flex size-8 items-center justify-center text-xl", custom && value && "rounded-lg bg-accent-soft ring-2 ring-accent")}>{custom ? value : "😀"}</span>
        <input
          inputMode="text"
          placeholder={t.common.anyEmoji}
          value=""
          onChange={(e) => {
            const g = firstGrapheme(e.target.value);
            if (g) onChange(g);
          }}
          className="h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
          aria-label={t.common.anyEmoji}
        />
      </label>
    </div>
  );
}

export const SECTION_COLORS = {
  violet: "from-[#7457ff] to-[#b18cff]",
  pink: "from-[#ff5f9e] to-[#ffa1c6]",
  amber: "from-[#ff9f1c] to-[#ffd166]",
  green: "from-[#16b884] to-[#6be3b5]",
  sky: "from-[#2f8cff] to-[#7cc4ff]",
  coral: "from-[#ff6a55] to-[#ffab91]",
} as const;
export type SectionColor = keyof typeof SECTION_COLORS;

export function colorClass(color: string) {
  return SECTION_COLORS[color as SectionColor] ?? SECTION_COLORS.violet;
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: SectionColor) => void }) {
  return (
    <div className="flex gap-2">
      {(Object.keys(SECTION_COLORS) as SectionColor[]).map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("size-9 rounded-full bg-linear-to-br transition active:scale-90", SECTION_COLORS[c], value === c && "ring-4 ring-accent-soft ring-offset-2 ring-offset-card-solid")}
        />
      ))}
    </div>
  );
}

export function IconTile({ icon, color, className }: { icon: string; color: string; className?: string }) {
  return (
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br text-xl shadow-sm", colorClass(color), className)}>
      {icon}
    </span>
  );
}
