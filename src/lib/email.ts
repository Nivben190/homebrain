import "server-only";

/** Sends a plain email through Resend's HTTP API. No-op without RESEND_API_KEY. */
export async function sendEmail(to: string, subject: string, body: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY missing, skipping email to", to);
    return false;
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
  });
  if (!res.ok) console.error("[email] failed", res.status, await res.text());
  return res.ok;
}
