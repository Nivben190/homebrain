"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Brain, LayoutGrid, Sun, UserRound } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { QuickAdd, type QuickMember, type QuickSpace } from "@/components/QuickAdd";

export function TabBar({ spaces, members, timeZone }: { spaces: QuickSpace[]; members: QuickMember[]; timeZone: string }) {
  const { t } = useI18n();
  const path = usePathname();
  const tabs = [
    { href: "/", label: t.nav.today, Icon: Sun, active: path === "/" || path.startsWith("/runs") },
    { href: "/sections", label: t.nav.spaces, Icon: LayoutGrid, active: path.startsWith("/sections") },
    { href: "/brain", label: t.nav.brain, Icon: Brain, active: path.startsWith("/brain") },
    { href: "/me", label: t.nav.me, Icon: UserRound, active: path.startsWith("/me") },
  ];
  return (
    <nav className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4">
      <div className="glass pointer-events-auto mx-auto flex max-w-md items-center justify-around rounded-[1.75rem] p-1.5">
        {tabs.map(({ href, label, Icon, active }, n) => [
          n === 2 && <QuickAdd key="add" spaces={spaces} members={members} timeZone={timeZone} />,
          <Link key={href} href={href} className="relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-3xl">
            {active && (
              <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-3xl bg-accent-soft" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
            )}
            <Icon className={cn("relative size-[22px] transition", active ? "text-accent" : "text-muted")} strokeWidth={active ? 2.4 : 2} />
            <span className={cn("relative text-[11px] font-semibold", active ? "text-accent" : "text-muted")}>{label}</span>
          </Link>,
        ])}
      </div>
    </nav>
  );
}
