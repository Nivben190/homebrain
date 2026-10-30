"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { quickAdd } from "@/app/actions";
import { routeCapture, type CaptureSpace } from "@/lib/capture";
import { parseWhen } from "@/lib/when";
import { todayKey } from "@/lib/engine/habits";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button, Input, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/Toaster";
import { errorKey } from "@/lib/errors";

export type QuickSpace = CaptureSpace & { icon: string };
export type QuickMember = { id: string; name: string; emoji: string };

const MEMORY = "quickadd-memory";
/** Window event that opens quick-add from elsewhere, e.g. a calendar day: detail { day }. */
export const QUICK_ADD_OPEN = "quickadd:open";
const norm = (s: string) => s.trim().toLowerCase();

/** Where the person last put this text, per device (a convenience, not shared state). */
function remembered(text: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(MEMORY) ?? "{}") as Record<string, string>)[norm(text)] ?? null;
  } catch {
    return null;
  }
}
function remember(text: string, spaceId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(MEMORY) ?? "{}") as Record<string, string>;
    all[norm(text)] = spaceId;
    localStorage.setItem(MEMORY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-200))));
  } catch {
    // Private mode: nothing to remember with.
  }
}

/** The center + of the tab bar (roadmap 2.3): type or dictate, check the chips, add. */
export function QuickAdd({ spaces, members, timeZone }: { spaces: QuickSpace[]; members: QuickMember[]; timeZone: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null | undefined>(undefined);
  const [time, setTime] = useState<string | null | undefined>(undefined);
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    const when = parseWhen(raw, todayKey(timeZone));
    const routed = routeCapture(when.text, spaces);
    const memo = remembered(routed.text);
    const auto = spaces.find((s) => s.id === memo) ?? routed.space;
    return { when, text: routed.text, auto };
  }, [raw, spaces, timeZone]);
  const space = spaces.find((s) => s.id === spaceId) ?? parsed.auto;
  const finalDay = day === undefined ? parsed.when.day : day;
  const finalTime = time === undefined ? parsed.when.time : time;

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const day = (e as CustomEvent<{ day?: string }>).detail?.day;
      if (day) setDay(day);
      setOpen(true);
    };
    window.addEventListener(QUICK_ADD_OPEN, onOpen);
    return () => window.removeEventListener(QUICK_ADD_OPEN, onOpen);
  }, []);

  const reset = () => {
    setRaw("");
    setSpaceId(null);
    setDay(undefined);
    setTime(undefined);
    setWho(null);
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!space || !parsed.text) return;
    setBusy(true);
    const res = await quickAdd({ sectionId: space.id, title: parsed.text, day: finalDay, time: finalDay ? finalTime : null, assigneeId: who });
    setBusy(false);
    if (!res.ok) return toast.error(t.failures[errorKey(res.error)]);
    if (spaceId) remember(parsed.text, spaceId);
    toast.success(fill(t.quickAdd.added, { space: `${space.icon} ${space.title}` }));
    reset();
    router.refresh();
  }

  const chip = "flex h-9 shrink-0 items-center gap-1 rounded-full bg-sunken px-3 text-sm font-semibold";
  const dayLabel = finalDay ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${finalDay}T12:00:00Z`)) : t.quickAdd.noDate;

  return (
    <>
      <button
        aria-label={t.quickAdd.title}
        onClick={() => setOpen(true)}
        className="relative mx-1 flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition active:scale-90"
      >
        <Plus className="size-7" strokeWidth={2.6} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.quickAdd.title}>
        <form onSubmit={add} className="space-y-3 pb-4">
          <Input ref={input} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={t.quickAdd.placeholder} enterKeyHint="done" />
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            <label className={cn(chip, "relative")}>
              {space ? `${space.icon} ${space.title}` : "—"}
              <select aria-label={t.quickAdd.pickSpace} className="absolute inset-0 opacity-0" value={space?.id ?? ""} onChange={(e) => setSpaceId(e.target.value)}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(chip, "relative", finalDay && "bg-accent-soft text-accent")}>
              📅 {dayLabel}
              <input type="date" aria-label={t.quickAdd.pickDay} className="absolute inset-0 opacity-0" value={finalDay ?? ""} onChange={(e) => setDay(e.target.value || null)} />
            </label>
            {finalDay && (
              <label className={cn(chip, "relative", finalTime && "bg-accent-soft text-accent")}>
                ⏰ {finalTime ?? "--:--"}
                <input type="time" aria-label={t.quickAdd.pickTime} className="absolute inset-0 opacity-0" value={finalTime ?? ""} onChange={(e) => setTime(e.target.value || null)} />
              </label>
            )}
            {members.length > 1 && (
              <label className={cn(chip, "relative", who && "bg-accent-soft text-accent")}>
                {members.find((m) => m.id === who)?.emoji ?? "👥"} {members.find((m) => m.id === who)?.name ?? t.quickAdd.nobody}
                <select aria-label={t.quickAdd.pickPerson} className="absolute inset-0 opacity-0" value={who ?? ""} onChange={(e) => setWho(e.target.value || null)}>
                  <option value="">{t.quickAdd.nobody}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.emoji} {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Button className="w-full" loading={busy} disabled={!space || !parsed.text}>
            {t.quickAdd.add}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
