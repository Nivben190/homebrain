"use client";
import { useState } from "react";
import { leaveHome, removeMember, rotateInvite, setMemberRole } from "@/app/actions";
import type { Role } from "@/lib/db-types";
import { useI18n } from "@/i18n/client";
import { Button, Select, Sheet } from "@/components/ui";
import { useToast } from "@/components/Toaster";

const ROLES: Role[] = ["owner", "adult", "teen", "child", "guest"];

export interface HomeMember {
  id: string;
  name: string;
  emoji: string;
  role: Role;
}

/** Everyone in the home with their role; owner tools to change roles, remove people and rotate the code; anyone can leave (roadmap 3.1). */
export function MembersCard({ members, userId }: { members: HomeMember[]; userId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const owner = members.find((m) => m.id === userId)?.role === "owner";
  const done = (res: { ok: boolean; error?: string }) => (res.ok ? toast.success(t.settings.saved) : toast.error(res.error ?? ""));

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2">
          <span className="text-xl">{m.emoji}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
          {owner && m.id !== userId ? (
            <>
              <Select aria-label={t.members.role} value={m.role} onChange={async (e) => done(await setMemberRole(m.id, e.target.value as Role))} className="h-9 w-28 text-sm">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t.members.roles[r]}
                  </option>
                ))}
              </Select>
              <button onClick={async () => confirm(t.members.removeConfirm.replace("{name}", m.name)) && done(await removeMember(m.id))} className="text-sm font-semibold text-danger">
                {t.members.remove}
              </button>
            </>
          ) : (
            <span className="text-sm text-muted">{t.members.roles[m.role]}</span>
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        {owner && (
          <Button size="sm" variant="soft" onClick={async () => done(await rotateInvite())}>
            🔄 {t.members.rotate}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}>
          🚪 {t.members.leave}
        </Button>
      </div>
      <Sheet open={leaving} onClose={() => setLeaving(false)} title={t.members.leave}>
        <div className="space-y-4 pb-4">
          <p className="text-sm text-muted">{members.length > 1 ? t.members.leaveHint : t.members.leaveLast}</p>
          <Button variant="danger" className="w-full" onClick={async () => done(await leaveHome())}>
            {t.members.leave}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
