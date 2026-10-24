"use client";
import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { alarmShortcutUrl } from "@/lib/engine/render";
import { Button, Chip, Input, Sheet } from "@/components/ui";

const PRESETS = ["06:00", "06:30", "07:00", "07:30", "08:00", "09:00"];
const STORAGE_KEY = "hb:last-alarm";
const LABEL_KEY = "hb:last-alarm-label";

/** "+N hours from now" rounded to 5 minutes, for naps / sleep. */
function inHours(h: number) {
  const d = new Date(Date.now() + h * 3600000);
  d.setMinutes(Math.round(d.getMinutes() / 5) * 5);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Sets a real iPhone alarm through the "Brain Set Alarm" Shortcut. A web app
 * can't touch the Clock app directly, so this opens the Shortcut with the time.
 */
export function AlarmSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [time, setTime] = useState("07:00");
  const [label, setLabel] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTime(saved);
      setLabel(localStorage.getItem(LABEL_KEY) ?? "");
    } catch {
      // Storage can be unavailable (private mode); the default time is fine.
    }
  }, []);

  function setAlarm() {
    try {
      localStorage.setItem(STORAGE_KEY, time);
      localStorage.setItem(LABEL_KEY, label);
    } catch {
      // Not critical: only remembers the last chosen time.
    }
    onClose();
    window.location.href = alarmShortcutUrl(time, label);
  }

  return (
    <Sheet open={open} onClose={onClose} title={`⏰ ${t.alarm.title}`}>
      <div className="space-y-5 pb-4">
        <input
          type="time"
          value={time}
          onChange={(e) => e.target.value && setTime(e.target.value)}
          className="h-24 w-full rounded-3xl bg-sunken text-center text-5xl font-extrabold tracking-tight outline-none"
          aria-label={t.actions.time}
        />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.alarm.namePlaceholder} aria-label={t.alarm.name} maxLength={40} />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Chip key={p} active={time === p} onClick={() => setTime(p)}>
              {p}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[0.5, 1, 7.5, 8].map((h) => (
            <Chip key={h} onClick={() => setTime(inHours(h))}>
              {h < 1 ? `+30 ${t.common.minutes}` : `+${h} ${t.alarm.hours}`}
            </Chip>
          ))}
        </div>
        <Button size="lg" className="w-full" onClick={setAlarm}>
          <AlarmClock className="size-5" /> {t.alarm.set} {time}
        </Button>
        <p className="text-center text-xs text-faint">{t.alarm.needsShortcut}</p>
      </div>
    </Sheet>
  );
}
