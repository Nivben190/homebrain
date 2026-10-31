import "server-only";

export type EmailResult = { ok: true } | { ok: false; reason: "not_configured" | "failed"; detail?: string };

/** Sends a plain email through Resend's HTTP API. Not sent without RESEND_API_KEY. */
export async function sendEmail(to: string, subject: string, body: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY missing, skipping email");
    return { ok: false, reason: "not_configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Home Brain <onboarding@resend.dev>",
      to: [to],
      subject,
      text: body,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return { ok: true };
  const detail = `${res.status} ${await res.text()}`.slice(0, 300);
  console.error("[email] failed", detail);
  return { ok: false, reason: "failed", detail };
}
