"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { createAccount } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Input, Segmented } from "@/components/ui";
import { LanguageSwitch } from "@/components/LanguageSwitch";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Errors handed back by /auth/confirm (e.g. an expired email link).
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(e);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (mode === "signup") {
      const res = await createAccount({ email, password, inviteCode: invite });
      if (!res.ok) {
        setBusy(false);
        if (res.error === "exists") {
          setMode("signin");
          return setError(t.login.exists);
        }
        const known: Record<string, string> = { not_invited: t.login.notInvited, too_many: t.login.tooMany };
        return setError(known[res.error] ?? res.error);
      }
    }
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) return setError(/invalid/i.test(error.message) ? t.login.invalid : error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="mb-8 flex size-20 items-center justify-center rounded-[1.75rem] bg-linear-to-br from-[#7457ff] via-[#b65cff] to-[#ff6fa8] text-4xl shadow-[0_20px_40px_-12px_#7457ff]"
        >
          🧠
        </motion.div>
        <h1 className="text-4xl font-extrabold tracking-tight">{t.login.title}</h1>
        <p className="mt-2 text-lg text-muted">{mode === "signin" ? t.login.subtitle : t.login.signupSubtitle}</p>

        <div className="mt-8">
          <Segmented<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: "signin", label: t.login.signIn },
              { value: "signup", label: t.login.createAccount },
            ]}
          />
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="relative">
            <Mail className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
            <Input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              placeholder={t.login.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 ps-12"
            />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
            <Input
              type={show ? "text" : "password"}
              name="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? t.login.newPassword : t.login.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-14 ps-12 pe-12"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? t.login.hide : t.login.show}
              className="absolute end-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-faint"
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          {mode === "signup" && (
            <div className="relative">
              <KeyRound className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
              <Input
                name="invite"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder={t.login.inviteCode}
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                className="h-14 ps-12"
              />
            </div>
          )}
          <Button size="lg" className="w-full" loading={busy}>
            {mode === "signin" ? t.login.signIn : t.login.createAccount} <ArrowRight className="size-5 rtl:rotate-180" />
          </Button>
        </form>
        {error && <p className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
      </div>
      <a href="/privacy" className="text-center text-xs text-faint underline">
        Privacy
      </a>
    </main>
  );
}
