"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useI18n } from "@/i18n/client";
import { Input } from "@/components/ui";
import { errorKey, type ErrorKey } from "@/lib/errors";

type Hit = { id: string; section_id: string; title: string; done: boolean };
const RECENT = "recent-searches";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
  } catch {
    return [];
  }
}

/** Search the whole house (roadmap 2.4): titles, notes and properties of every space you can see. */
export function SearchBox({ spaces }: { spaces: { id: string; icon: string; title: string }[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [failed, setFailed] = useState<ErrorKey | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  // Leaving the box hides the recent searches a moment later, so a tap on one lands first.
  const blur = useRef<ReturnType<typeof setTimeout>>(undefined);
  const byId = new Map(spaces.map((s) => [s.id, s]));

  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => {
    const term = q.trim();
    setFailed(null);
    if (term.length < 2) return setHits(null);
    // A slow answer to an earlier search mustn't replace the current one.
    let current = true;
    const timer = setTimeout(async () => {
      let res: { data: unknown; error: unknown };
      try {
        res = await supabaseBrowser().rpc("search_items", { q: term });
      } catch (e) {
        res = { data: null, error: e };
      }
      const { data, error } = res;
      if (!current) return;
      setFailed(error ? errorKey(error) : null);
      setHits(error ? null : ((data as Hit[]) ?? []));
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q]);

  const keep = () => {
    const term = q.trim();
    if (term.length < 2) return;
    const next = [term, ...recent.filter((r) => r !== term)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT, JSON.stringify(next));
    } catch {
      // Private mode.
    }
  };

  return (
    <div className="mb-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            clearTimeout(blur.current);
            setFocused(true);
          }}
          onBlur={() => (blur.current = setTimeout(() => setFocused(false), 150))}
          placeholder={t.search.placeholder}
          aria-label={t.search.placeholder}
          className="ps-12"
        />
        {q && (
          <button aria-label={t.search.clear} onClick={() => setQ("")} className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-muted">
            <X className="size-5" />
          </button>
        )}
      </div>
      {focused && !q && recent.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {recent.map((r) => (
            <button key={r} onClick={() => setQ(r)} className="rounded-full bg-sunken px-3 py-1.5 text-sm font-medium">
              {r}
            </button>
          ))}
        </div>
      )}
      {failed && <p className="mt-2 rounded-3xl bg-sunken p-4 text-center text-sm text-muted">{t.failures[failed]}</p>}
      {hits && (
        <div className="glass mt-2 divide-y divide-card-border overflow-hidden rounded-3xl">
          {hits.length === 0 && <p className="p-4 text-center text-sm text-muted">{t.search.none}</p>}
          {hits.map((h) => {
            const s = byId.get(h.section_id);
            return (
              <Link key={h.id} href={`/sections/${h.section_id}`} onClick={keep} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">{s?.icon}</span>
                <span className={h.done ? "flex-1 truncate text-muted line-through" : "flex-1 truncate font-medium"}>{h.title}</span>
                <span className="max-w-[40%] truncate text-xs text-muted">{s?.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
