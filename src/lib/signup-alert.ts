// The email the app's owner gets when someone creates an account
// (sent to SIGNUP_ALERT_EMAIL; nothing is sent when it isn't set).

export type SignupVia = "link" | "code" | "allowed" | "first";

const VIA: Record<SignupVia, string> = {
  link: "an invite link",
  code: "a home's invite code",
  allowed: "the allowed-emails list",
  first: "the first account (no home existed yet)",
};

export function signupAlert(input: { email: string; via: SignupVia; accounts: number | null; at: Date; appUrl?: string }) {
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(input.at);
  const lines = [
    `${input.email} just created a Home Brain account.`,
    "",
    `How they got in: ${VIA[input.via]}`,
    `When: ${when} (Israel time)`,
    ...(input.accounts != null ? [`Accounts now: ${input.accounts}`] : []),
    "",
    "They choose their name and home next.",
    ...(input.appUrl ? [input.appUrl] : []),
  ];
  return { subject: `New sign-up: ${input.email}`, body: lines.join("\n") };
}
