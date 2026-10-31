import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { Card } from "@/components/ui";
import { readMail } from "@/lib/subs/mail";

/** One email a bill or subscription came from, read inside the app. */
export default async function MailPage({ params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const { supabase, profile } = await requireHome();
  const t = await getT();
  const mail = await readMail(supabase, id, messageId);

  return (
    <div className="safe-top pb-10">
      <Link href={`/sections/${id}`} className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.common.back}
      </Link>
      {!mail.ok ? (
        <Card className="py-10 text-center text-muted">{t.subs.mail[mail.error]}</Card>
      ) : (
        <article>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{mail.subject || t.subs.mail.noSubject}</h1>
          <p className="mt-2 text-sm text-muted">
            <span dir="auto" className="font-semibold text-fg">{mail.from}</span>
            {" · "}
            {new Intl.DateTimeFormat(profile.locale, { timeZone: profile.timezone, dateStyle: "medium", timeStyle: "short" }).format(mail.date)}
          </p>
          {mail.pdfs.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {mail.pdfs.map((name, n) => (
                <a
                  key={n}
                  href={`/api/google/mail-pdf?section=${id}&message=${encodeURIComponent(messageId)}&n=${n}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex max-w-full items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent"
                >
                  <FileText className="size-4 shrink-0" />
                  <span className="truncate">{name}</span>
                </a>
              ))}
            </div>
          )}
          <Card className="mt-4">
            <div dir="auto" className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {mail.text.trim() || t.subs.mail.empty}
            </div>
          </Card>
        </article>
      )}
    </div>
  );
}
