"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronLeft, Lock, RefreshCw, Settings2 } from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { IconButton, IconTile } from "@/components/ui";
import { PropertyChips, type Member } from "./PropertyInput";
import { ItemSheet } from "./ItemSheet";
import { SectionSettingsSheet } from "./SectionSettingsSheet";
import { HabitSheet } from "./HabitSheet";
import { HabitCard, useCelebrate } from "./TrackerView";
import { GalleryView } from "./GalleryView";
import { DatesView } from "./DatesView";
import { DateSheet, datePatch } from "./DateSheet";
import { SubscriptionsView, type GmailStatus } from "./SubscriptionsView";
import { SubscriptionSheet } from "./SubscriptionSheet";
import { manualSub, readSub, subPatch, SUB_PROP } from "@/lib/subs/types";
import { currentOccurrence, defaultDate, readDate } from "@/lib/engine/dates";
import { handleDate } from "@/app/actions";
import { assigneesFor, readHabit, todayKey } from "@/lib/engine/habits";
import { deleteAttachment, readPhotos } from "@/lib/photos";
import { RemoveBadge, SwipeRow } from "./SwipeRow";
import { notesShortcutUrl } from "@/lib/engine/render";

const SYNC_KEY = "hb:notes-sync";

/** Deletes an item for real, then its photos in storage (only once the row is gone). */
async function purgeItem(item: Item) {
  const { error } = await supabaseBrowser().from("items").delete().eq("id", item.id);
  if (!error) await Promise.all(readPhotos(item.props).map(deleteAttachment));
  return { error };
}
import type { CheckinRow, Item, Section } from "@/lib/db-types";
import { useToast } from "@/components/Toaster";
import { idbQueue, isNetworkError, type QueuedWrite } from "@/lib/offline-queue";
import { fill } from "@/i18n";
import { spaceType } from "@/lib/registry/spaces";
import { WheelView } from "./WheelView";
import { WHEEL_PROP } from "@/lib/wheel";
import { CommitView } from "./CommitView";
import { SpendView } from "./SpendView";
import { FridgeView } from "./FridgeView";
import { FRIDGE_PROP } from "@/lib/fridge";
import { newCommit, type Period } from "@/lib/commit";

export function SectionScreen({
  initialSection,
  initialItems,
  initialCheckins,
  userId,
  members,
  timeZone,
  launch,
  gmail = null,
}: {
  initialSection: Section;
  initialItems: Item[];
  initialCheckins: CheckinRow[];
  userId: string;
  members: Member[];
  timeZone: string;
  /** Signed tokens for Shortcuts the app launches or tests (roadmap 1.3). */
  launch: { notes: string; checkin: string };
  /** The user's Gmail connection, for a Subscriptions space. */
  gmail?: GmailStatus | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const sb = supabaseBrowser();
  const [section, setSection] = useState(initialSection);
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState("");
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [settings, setSettings] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [checkins, setCheckins] = useState(initialCheckins);
  const [selectedDay, setSelectedDay] = useState(() => todayKey(timeZone));
  const inputRef = useRef<HTMLInputElement>(null);
  const { node: celebration, celebrate } = useCelebrate();
  const [editing, setEditing] = useState(false);
  // Deletes wait a few seconds so they can be undone.
  const pending = useRef<{ item: Item; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [syncToast, setSyncToast] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  // A write that didn't reach the database (e.g. no signal): its change was undone; Retry redoes it.
  // Several can fail in a row (no signal); Retry redoes all of them.
  const [failed, setFailed] = useState<(() => void)[]>([]);
  const toast = useToast();
  useEffect(() => {
    if (!failed.length) return toast.dismiss("save-failed");
    toast.error(
      failed.length > 1 ? `${t.sections.saveFailed} (${failed.length})` : t.sections.saveFailed,
      () => {
        setFailed([]);
        failed.forEach((retry) => retry());
      },
      "save-failed",
    );
  }, [failed, toast, t]);

  /** Runs a write; if it fails, undoes the optimistic change and offers Retry. */
  // With `queued`, a write made without signal keeps its change and waits in the offline queue instead.
  const persist = useCallback(async (write: () => PromiseLike<{ error: unknown }>, revert: () => void, retry: () => void, queued?: QueuedWrite) => {
    let error: unknown;
    try {
      ({ error } = await write());
    } catch (e) {
      error = e;
    }
    if (!error) return true;
    if (queued && isNetworkError(error)) {
      try {
        await idbQueue.add(queued);
        return true;
      } catch {
        // No IndexedDB: fall back to Retry.
      }
    }
    console.error("[save] failed", error);
    revert();
    setFailed((f) => [...f, retry]);
    return false;
  }, []);

  // Back from the Notes Shortcut: reload the list (the socket sleeps while away)
  // and show what the sync did.
  useEffect(() => {
    async function onReturn() {
      if (document.visibilityState !== "visible") return;
      let pendingSync: { section: string; at: string } | null = null;
      try {
        pendingSync = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null");
      } catch {
        return;
      }
      if (!pendingSync || pendingSync.section !== section.id || Date.now() - Date.parse(pendingSync.at) > 10 * 60000) return;
      const { data: fresh } = await sb.from("items").select("*").eq("section_id", section.id);
      if (fresh) setItems(fresh as Item[]);
      // The result may land a moment after we're back; look a few times.
      for (let i = 0; i < 4; i++) {
        const { data: ev } = await sb
          .from("events")
          .select("payload")
          .eq("type", "notes_sync")
          .gte("created_at", pendingSync.at)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const p = ev?.payload as { section?: string | null; added?: number; checked?: number; unchecked?: number; removed?: number; appended?: number; chars?: number; problem?: string | null; sample?: string } | undefined;
        if (p && p.section === null) {
          // The Shortcut sent the note edited last, and it isn't this list's note.
          localStorage.removeItem(SYNC_KEY);
          const title = (p.sample ?? "").trim();
          setSyncToast(
            p.problem === "empty"
              ? { ok: false, text: t.notesSync.emptyNote }
              : p.problem === "literal"
                ? { ok: false, text: fill(t.notesSync.literalWord, { word: title }) }
                : section.notes_link
                  ? { ok: false, text: fill(t.notesSync.otherNote, { title }).replaceAll("{link}", section.notes_link) }
                  : { ok: false, text: fill(t.notesSync.unlinked, { title }), link: title },
          );
          setTimeout(() => setSyncToast(null), 10000);
          return;
        }
        if (p && p.section === section.id) {
          localStorage.removeItem(SYNC_KEY);
          if (p.added || p.checked || p.unchecked || p.removed) {
            const { data: again } = await sb.from("items").select("*").eq("section_id", section.id);
            if (again) setItems(again as Item[]);
          }
          setSyncToast(
            p.problem === "literal"
              ? { ok: false, text: fill(t.notesSync.literalWord, { word: (p.sample ?? "").trim() }) }
              : p.chars && !p.problem
                ? { ok: true, text: fill(t.notesSync.synced, { added: String(p.added ?? 0), checked: String(p.checked ?? 0), appended: String(p.appended ?? 0), unchecked: String(p.unchecked ?? 0), removed: String(p.removed ?? 0) }) }
                : { ok: false, text: t.notesSync.emptyNote },
          );
          setTimeout(() => setSyncToast(null), 5000);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      localStorage.removeItem(SYNC_KEY);
      setSyncToast({ ok: false, text: t.notesSync.notArrived });
      setTimeout(() => setSyncToast(null), 6000);
    }
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [sb, section.id, section.notes_link, t]);

  useEffect(
    () => () => {
      // Leaving the screen commits a pending delete.
      const p = pending.current;
      if (p) {
        clearTimeout(p.timer);
        void purgeItem(p.item);
      }
    },
    [],
  );

  // Live sync with the other phone.
  useEffect(() => {
    const ch = sb
      .channel(`items:${section.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `section_id=eq.${section.id}` }, (payload: RealtimePostgresChangesPayload<Item>) => {
        setItems((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((i) => i.id !== (payload.old as Item).id);
          const row = payload.new as Item;
          if (pending.current?.item.id === row.id) return prev;
          const exists = prev.some((i) => i.id === row.id);
          return exists ? prev.map((i) => (i.id === row.id ? row : i)) : [...prev, row];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sections", filter: `id=eq.${section.id}` }, (payload: RealtimePostgresChangesPayload<Section>) => setSection(payload.new as Section))
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, (payload: RealtimePostgresChangesPayload<CheckinRow>) => {
        setCheckins((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((c) => c.id !== (payload.old as CheckinRow).id);
          const row = payload.new as CheckinRow;
          const rest = prev.filter((c) => c.id !== row.id && !(c.item_id === row.item_id && c.day === row.day));
          return [...rest, row];
        });
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [sb, section.id]);

  const sorted = useMemo(() => [...items].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)), [items]);
  const kind = spaceType(section.view);
  const isChecklist = kind.checkable;
  const isTracker = section.view === "tracker";
  const isGallery = section.view === "gallery";
  const isDates = section.view === "dates";
  const isSubs = section.view === "subscriptions";
  const open = isChecklist ? sorted.filter((i) => !i.done) : sorted;
  const done = isChecklist ? sorted.filter((i) => i.done) : [];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const temp: Item = {
      id: crypto.randomUUID(),
      section_id: section.id,
      title,
      props: {},
      done: false,
      position: (sorted.at(-1)?.position ?? 0) + 1,
      due_at: null,
      remind_at: null,
      assignee_id: null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (isDates) Object.assign(temp, datePatch(temp, defaultDate(selectedDay), [], timeZone));
    if (section.view === "fridge") temp.props = { [FRIDGE_PROP]: { level: "full", staple: true } };
    if (section.view === "wheel") temp.props = { [WHEEL_PROP]: { options: [] } };
    if (section.view === "commit") Object.assign(temp, newCommit(title, new Date(), timeZone));
    if (isSubs) temp.props = { [SUB_PROP]: manualSub(locale === "he" ? "ILS" : "USD") };
    const newRow = { id: temp.id, section_id: temp.section_id, title: temp.title, position: temp.position, props: temp.props, remind_at: temp.remind_at, due_at: temp.due_at };
    const save = async (): Promise<boolean> => {
      setItems((p) => [...p, temp]);
      return persist(
        () => sb.from("items").upsert(newRow),
        () => setItems((p) => p.filter((i) => i.id !== temp.id)),
        () => void save(),
        { table: "items", action: "upsert", values: newRow },
      );
    };
    if (!(await save())) return;
    // New tracker items go straight to their schedule; memories to their photos; reminders to their alerts.
    if (kind.opensSheetOnAdd) setOpenItem(temp);
    else inputRef.current?.focus();
  }

  /** "Commit again" from a finished commitment, for the same length of time. */
  async function addCommit(text: string, period: Period, limit?: number) {
    const c = newCommit(text, new Date(), timeZone, period, limit);
    const row = { id: crypto.randomUUID(), section_id: section.id, title: c.title, props: c.props, remind_at: c.remind_at, position: (sorted.at(-1)?.position ?? 0) + 1 };
    const save = async () => {
      setItems((p) => [...p, { ...row, done: false, due_at: null, assignee_id: null, created_by: userId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
      await persist(() => sb.from("items").upsert(row), () => setItems((p) => p.filter((i) => i.id !== row.id)), () => void save(), { table: "items", action: "upsert", values: row });
    };
    await save();
  }

  /** "No more needed" (or undo) for a reminder-calendar item's current date. */
  async function handleDateItem(item: Item, handled: boolean) {
    const spec = readDate(item.props);
    if (!spec) return;
    const days = new Set(checkins.filter((c) => c.item_id === item.id && c.status === "done").map((c) => c.day));
    const day = handled ? currentOccurrence(spec, todayKey(timeZone), (d) => days.has(d)) : [...days].sort().at(-1);
    if (!day) return;
    const rest = (p: CheckinRow[]) => p.filter((c) => !(c.item_id === item.id && c.day === day));
    const mine = (c: CheckinRow) => c.item_id === item.id && c.day === day;
    const before = { rows: checkins.filter(mine), done: item.done };
    if (handled) {
      setCheckins((p) => [...rest(p), { id: crypto.randomUUID(), item_id: item.id, user_id: userId, day, status: "done", note: null, created_at: new Date().toISOString() }]);
    } else setCheckins(rest);
    if (spec.repeat === "once") setItems((p) => p.map((i) => (i.id === item.id ? { ...i, done: handled } : i)));
    const ok = await persist(
      async () => {
        await handleDate(item.id, handled);
        return { error: null };
      },
      () => {
        setCheckins((p) => [...p.filter((c) => !mine(c)), ...before.rows]);
        setItems((p) => p.map((i) => (i.id === item.id ? { ...i, done: before.done } : i)));
      },
      () => void handleDateItem(item, handled),
    );
    if (ok && handled) celebrate();
  }

  /** Check in (or undo) today's session for a tracker item. */
  async function checkIn(item: Item, status: "done" | "skipped" | null) {
    const day = todayKey(timeZone);
    const existing = checkins.find((c) => c.item_id === item.id && c.day === day);
    const retry = () => void checkIn(item, status);
    // Undo only today's row for this item, so other pending check-ins survive.
    const revert = () => setCheckins((p) => [...p.filter((c) => !(c.item_id === item.id && c.day === day)), ...(existing ? [existing] : [])]);
    if (status === null) {
      setCheckins((p) => p.filter((c) => c !== existing));
      await persist(() => sb.from("checkins").delete().eq("item_id", item.id).eq("day", day), revert, retry, { table: "checkins", action: "delete", match: { item_id: item.id, day } });
      return;
    }
    const row: CheckinRow = { id: existing?.id ?? crypto.randomUUID(), item_id: item.id, user_id: userId, day, status, note: null, created_at: new Date().toISOString() };
    setCheckins((p) => [...p.filter((c) => c !== existing), row]);
    const values = { id: row.id, item_id: item.id, day, status };
    const ok = await persist(() => sb.from("checkins").upsert(values, { onConflict: "item_id,day" }), revert, retry, { table: "checkins", action: "upsert", values, onConflict: "item_id,day" });
    if (ok && status === "done") celebrate();
  }

  const update = useCallback(
    async function updateItem(id: string, patch: Partial<Item>) {
      let previous: Partial<Item> | undefined;
      setItems((p) =>
        p.map((i) => {
          if (i.id !== id) return i;
          previous = Object.fromEntries(Object.keys(patch).map((k) => [k, i[k as keyof Item]])) as Partial<Item>;
          return { ...i, ...patch };
        }),
      );
      setOpenItem((o) => (o?.id === id ? { ...o, ...patch } : o));
      const values = { ...patch, updated_at: new Date().toISOString() };
      await persist(
        () => sb.from("items").update(values).eq("id", id),
        () => {
          if (!previous) return;
          const undo = previous;
          setItems((p) => p.map((i) => (i.id === id ? { ...i, ...undo } : i)));
          setOpenItem((o) => (o?.id === id ? { ...o, ...undo } : o));
        },
        () => void updateItem(id, patch),
        { table: "items", action: "update", values, match: { id } },
      );
    },
    [sb, persist],
  );

  function remove(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const prev = pending.current;
    if (prev) {
      clearTimeout(prev.timer);
      void deleteForGood(prev.item);
    }
    setItems((p) => p.filter((i) => i.id !== id));
    setOpenItem(null);
    const timer = setTimeout(() => {
      pending.current = null;
      toast.dismiss("undo");
      void deleteForGood(item);
    }, 5000);
    pending.current = { item, timer };
    toast.undo(`${t.sections.deleted}: ${item.title}`, undoRemove, section.notes_link ? t.notesSync.deleteHint : undefined);
  }

  /** The real delete after the undo window; a failed one puts the item back. */
  function deleteForGood(item: Item) {
    return persist(() => purgeItem(item), () => setItems((p) => (p.some((i) => i.id === item.id) ? p : [...p, item])), () => remove(item.id), { table: "items", action: "delete", match: { id: item.id } });
  }

  /** Subscriptions found in Gmail are hidden instead (a scan would bring them back). */
  function removeSub(id: string) {
    const item = items.find((i) => i.id === id);
    const sub = item && readSub(item.props);
    if (!item || !sub || sub.source !== "gmail") return remove(id);
    setOpenItem(null);
    void update(id, subPatch(item.props, { ...sub, status: "hidden" }, timeZone, new Set()));
  }

  async function reload() {
    const { data } = await sb.from("items").select("*").eq("section_id", section.id);
    if (data) setItems(data as Item[]);
  }

  function undoRemove() {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setItems((prev) => [...prev, p.item]);
  }

  return (
    <>
      <header className="safe-top sticky top-0 z-30 -mx-4 mb-3 bg-linear-to-b from-bg via-bg/90 to-transparent px-4 pb-3">
        <div className="flex items-center justify-between">
          <Link href="/sections" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
            <ChevronLeft className="size-4 rtl:rotate-180" /> {t.nav.spaces}
          </Link>
          <div className="flex items-center gap-2">
            {kind.notesSync && (
              <IconButton
                aria-label={t.notesSync.button}
                title={t.notesSync.button}
                onClick={() => {
                  // Remember the sync so we can show its result when the user comes back.
                  try {
                    localStorage.setItem(SYNC_KEY, JSON.stringify({ section: section.id, at: new Date().toISOString() }));
                  } catch {
                    // Without storage we just skip the result toast.
                  }
                  window.location.href = notesShortcutUrl(launch.notes, section.id);
                }}
              >
                <RefreshCw className="size-5" />
              </IconButton>
            )}
            {sorted.length > 0 && (
              <button
                onClick={() => setEditing((e) => !e)}
                className={cn("h-10 rounded-full px-4 text-sm font-bold transition active:scale-95", editing ? "bg-accent text-accent-fg" : "bg-sunken text-fg")}
              >
                {editing ? t.common.done : t.common.edit}
              </button>
            )}
            <IconButton aria-label={t.sections.settings} onClick={() => setSettings(true)}>
              <Settings2 className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <IconTile icon={section.icon} color={section.color} className="size-14 rounded-[1.25rem] text-3xl" />
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight">{section.title}</h1>
            <p className="flex items-center gap-1 text-sm text-muted">
              {section.owner_id ? <><Lock className="size-3.5" /> {t.common.private}</> : <>👫 {t.common.shared}</>} · {open.length} {t.sections.items}
            </p>
          </div>
        </div>
      </header>

      {sorted.length === 0 && !kind.ownEmptyState && <p className="glass rounded-3xl px-4 py-10 text-center text-muted">{t.sections.empty}</p>}

      {section.view === "fridge" ? (
        <FridgeView section={section} items={sorted} onUpdate={update} onDelete={remove} onReload={reload} />
      ) : section.view === "spend" ? (
        <SpendView
          section={section}
          items={sorted}
          timeZone={timeZone}
          onDelete={remove}
          onSettings={async (settings) => {
            setSection({ ...section, settings });
            await sb.from("sections").update({ settings }).eq("id", section.id);
          }}
        />
      ) : section.view === "commit" ? (
        <CommitView items={sorted} onUpdate={update} onDelete={remove} onAdd={addCommit} />
      ) : section.view === "wheel" ? (
        <WheelView section={section} items={sorted} timeZone={timeZone} userId={userId} onUpdate={update} onDelete={remove} />
      ) : isSubs ? (
        <SubscriptionsView section={section} items={sorted} gmail={gmail} timeZone={timeZone} editing={editing} onOpen={setOpenItem} onDelete={removeSub} onReload={reload} />
      ) : isDates ? (
        <DatesView
          items={sorted}
          checkins={checkins}
          timeZone={timeZone}
          selected={selectedDay}
          onSelect={setSelectedDay}
          onOpen={setOpenItem}
          onHandle={handleDateItem}
          editing={editing}
          onDelete={remove}
        />
      ) : isGallery ? (
        <GalleryView section={section} items={sorted} onOpen={setOpenItem} editing={editing} onDelete={remove} />
      ) : isTracker ? (
        <div className="space-y-3">
          {sorted.map((i) => (
            <div key={i.id} className="flex items-center gap-2">
              <AnimatePresence>{editing && <RemoveBadge onClick={() => remove(i.id)} />}</AnimatePresence>
              <SwipeRow onDelete={() => remove(i.id)} className="min-w-0 flex-1 rounded-3xl">
                <HabitCard
                  item={i}
                  checkins={checkins.filter((c) => c.item_id === i.id)}
                  members={members}
                  timeZone={timeZone}
                  onOpen={() => setOpenItem(i)}
                  onCheckIn={(status) => checkIn(i, status)}
                  assignees={(() => {
                    const habit = readHabit(i.props);
                    return habit ? assigneesFor(habit, todayKey(timeZone), members.map((m) => m.id), i.assignee_id ?? section.owner_id ?? i.created_by) : undefined;
                  })()}
                />
              </SwipeRow>
            </div>
          ))}
        </div>
      ) : section.view === "notes" ? (
        <div className="columns-2 gap-3 [&>*]:mb-3">
          {open.map((i) => (
            <div key={i.id} className="relative break-inside-avoid">
              <motion.button layout onClick={() => setOpenItem(i)} className="glass block w-full rounded-3xl p-4 text-start">
                <p className="font-bold leading-snug">{i.title}</p>
                {typeof i.props._notes === "string" && <p className="mt-1 line-clamp-6 whitespace-pre-line text-sm text-muted">{i.props._notes}</p>}
              </motion.button>
              <AnimatePresence>{editing && <RemoveBadge onClick={() => remove(i.id)} className="absolute -start-1.5 -top-1.5" />}</AnimatePresence>
            </div>
          ))}
        </div>
      ) : (
        <ul className="glass divide-y divide-card-border overflow-hidden rounded-3xl empty:hidden">
          <AnimatePresence initial={false}>
            {open.map((i) => (
              <ItemRow key={i.id} item={i} section={section} members={members} locale={locale} checklist={isChecklist} editing={editing} onDelete={() => remove(i.id)} onToggle={() => update(i.id, { done: !i.done })} onOpen={() => setOpenItem(i)} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowDone((v) => !v)} className="px-1 text-sm font-semibold text-muted">
            {showDone ? t.sections.hideDone : t.sections.showDone} ({done.length})
          </button>
          {showDone && (
            <ul className="glass mt-2 divide-y divide-card-border overflow-hidden rounded-3xl opacity-70">
              {done.map((i) => (
                <ItemRow key={i.id} item={i} section={section} members={members} locale={locale} checklist editing={editing} onDelete={() => remove(i.id)} onToggle={() => update(i.id, { done: !i.done })} onOpen={() => setOpenItem(i)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Quick-add bar floats above the tab bar */}
      {kind.quickAdd && (
      <form onSubmit={add} className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+5.25rem)] z-30 px-4">
        <div className="glass mx-auto flex max-w-lg items-center gap-2 rounded-2xl p-1.5 ps-4">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={kind.addPlaceholder(t)}
            className="h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
            enterKeyHint="done"
          />
          <button disabled={!draft.trim()} className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-fg transition active:scale-90 disabled:opacity-30" aria-label={t.common.add}>
            <ArrowUp className="size-5" strokeWidth={2.6} />
          </button>
        </div>
      </form>
      )}
      <div className="h-20" />

      {/* Result of a Notes sync, shown when coming back from Shortcuts */}
      <AnimatePresence>
        {syncToast && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            onClick={() => setSyncToast(null)}
            className={cn(
              "fixed inset-x-4 top-[max(env(safe-area-inset-top),1rem)] z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl",
              syncToast.ok ? "bg-success text-white" : "bg-warn text-[#3a2600]",
            )}
          >
            {syncToast.text}
            {syncToast.link && (
              <button
                type="button"
                className="mt-2 block rounded-full bg-[#3a2600] px-3 py-1.5 text-xs font-bold text-white"
                onClick={async (e) => {
                  e.stopPropagation();
                  const notes_link = syncToast.link!;
                  await sb.from("sections").update({ notes_link, notes_state: null }).eq("id", section.id);
                  setSection({ ...section, notes_link });
                  setSyncToast({ ok: true, text: fill(t.notesSync.linkedNow, { title: notes_link }) });
                  setTimeout(() => setSyncToast(null), 6000);
                }}
              >
                🔗 {t.notesSync.linkIt}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isSubs ? (
        <SubscriptionSheet
          item={openItem}
          section={section}
          checkins={openItem ? checkins.filter((c) => c.item_id === openItem.id) : []}
          timeZone={timeZone}
          gmailEmail={gmail?.email ?? null}
          onClose={() => setOpenItem(null)}
          onChange={update}
          onDelete={removeSub}
        />
      ) : isDates ? (
        <DateSheet
          item={openItem}
          section={section}
          checkins={openItem ? checkins.filter((c) => c.item_id === openItem.id) : []}
          members={members}
          timeZone={timeZone}
          onClose={() => setOpenItem(null)}
          onChange={update}
          onDelete={remove}
          onHandle={handleDateItem}
        />
      ) : isTracker ? (
        <HabitSheet
          item={openItem}
          section={section}
          checkins={openItem ? checkins.filter((c) => c.item_id === openItem.id) : []}
          members={members}
          timeZone={timeZone}
          onClose={() => setOpenItem(null)}
          onChange={update}
          onDelete={remove}
          onCheckIn={checkIn}
          userId={userId}
          launchToken={launch.checkin}
        />
      ) : (
        <ItemSheet item={openItem} section={section} members={members} onClose={() => setOpenItem(null)} onChange={update} onDelete={remove} />
      )}
      {celebration}
      <SectionSettingsSheet
        open={settings}
        section={section}
        userId={userId}
        onClose={() => setSettings(false)}
        onSaved={(s) => setSection(s)}
        onDeleted={() => {
          router.push("/sections");
          router.refresh();
        }}
      />
    </>
  );
}

function ItemRow({
  item,
  section,
  members,
  locale,
  checklist,
  editing,
  onDelete,
  onToggle,
  onOpen,
}: {
  item: Item;
  section: Section;
  members: Member[];
  locale: string;
  checklist: boolean;
  editing: boolean;
  onDelete: () => void;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <motion.li layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
      <SwipeRow onDelete={onDelete}>
        <div className="flex items-center gap-3 px-4">
          <AnimatePresence>{editing && <RemoveBadge onClick={onDelete} />}</AnimatePresence>
      {checklist && (
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={onToggle}
          aria-label="Toggle"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition",
            item.done ? "border-success bg-success text-white" : "border-faint-deco",
          )}
        >
          {item.done && <Check className="size-4" strokeWidth={3.5} />}
        </motion.button>
      )}
      <button onClick={onOpen} className="min-w-0 flex-1 py-3.5 text-start">
        <span className={cn("block text-[16px] font-medium leading-snug", item.done && "text-muted line-through")}>{item.title}</span>
        <PropertyChips schema={section.schema} props={item.props} members={members} locale={locale} />
      </button>
        </div>
      </SwipeRow>
    </motion.li>
  );
}
