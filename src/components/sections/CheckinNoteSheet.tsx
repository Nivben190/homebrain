"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { Button, Sheet, Textarea } from "@/components/ui";

/** An optional note on a day's check-in ("legs were sore", "cold water only"). */
export function CheckinNoteSheet({
  open,
  title,
  day,
  note,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  day: string;
  note: string | null;
  onClose: () => void;
  onSave: (note: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText(note ?? "");
  }, [open, note]);
  const date = day ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          className="w-full"
          onClick={() => {
            onSave(text.trim() || null);
            onClose();
          }}
        >
          {t.tracker.saveNote}
        </Button>
      }
    >
      <p className="mb-2 text-sm font-semibold text-muted">{date}</p>
      <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t.tracker.notePlaceholder} maxLength={500} rows={3} />
    </Sheet>
  );
}
