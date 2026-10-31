# 🧠 Home Brain

A home "brain" for a couple or a whole family: an installable iPhone web app that reminds, nudges and acts.
It sends push notifications, prepares WhatsApp/SMS messages, sends emails, adds calendar events and sets real iPhone alarms (via Shortcuts).
Everything you see (spaces, lists, routines, automations) is created from the UI, not from code.

## How it works

| Building block | What it is |
| --- | --- |
| **Spaces** | Notion-style lists: shared or private, custom properties (text, number, price, date, select, link, person, checkbox), checklist / list / notes layouts, live sync between both phones. |
| **Brain (automations)** | *When* (schedule or event: wake up, get home, …) → *Only if* (time window, days, once a day) → *Then* (notification, WhatsApp, SMS, email, alarm, calendar event, open space, add item, done button). Text supports `{{partner}}`, `{{me}}`, `{{time}}`, `{{date}}`, `{{weekday}}`, `{{random:<spaceId>}}`. |
| **Today** | Three bands: *Now* (what needs you), *Today* (one timeline), *Home* (the others, weather, Shabbat, pets). Quick-add from the + in the tab bar understands "dentist Tuesday 10". |
| **Home** | Calendar (a week of everything dated, plus Google Calendar), meal plan → shopping list, money (monthly total, budgets, settle-up), weekly check-in, home info card (Wi-Fi QR, contacts, encrypted owner-only secrets), sitter links. |
| **Runs** | Each time an automation fires it creates a run. Tapping the notification opens it, with the prepared buttons. "Done" taps build streaks 🔥. |

Engine: Supabase `pg_cron` calls `POST /api/engine/tick` every minute. iOS Shortcuts call `POST /api/hooks/event` (e.g. when your alarm is stopped → `wake`).

Code map: `src/lib/engine` (pure scheduling/templates + executor), `src/lib/registry` (property/action metadata), `src/app/(app)` (screens), `supabase/migrations` (schema, RLS, cron).

## Setup

1. **Supabase**: create a project at supabase.com and run the files in `supabase/migrations` in order (`0003` comes after deploy).
   - Sign-in is email + password. Accounts are created already confirmed, through the service-role key, so no email is ever sent and there are no email templates or SMTP to set up.
   - Sign-up is invite only: an email in `ALLOWED_EMAILS=you@x.com,partner@y.com`, or anyone with a household invite code. With no home yet, the first account is let in.
2. **Env**: `cp .env.example .env.local` and fill it in. [docs/SECRETS.md](docs/SECRETS.md) lists what each secret unlocks and how to rotate it. Generate push keys with `npx web-push generate-vapid-keys`.
3. **Run locally**: `npm install`, then `npm run dev`. Push notifications only work in a production build (`npm run build && npm start`) over HTTPS.
4. **Deploy**: push to GitHub and import the repo in Vercel. Add the same env vars there.
5. **Heartbeat**: in the Supabase SQL editor, run:
   ```sql
   select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
   select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
   ```
   Then run `supabase/migrations/0003_cron.sql`.
6. **iPhone** (both of you): open the site in Safari → Share → *Add to Home Screen*. Open it from the home screen, tap *Create account* (Keychain can save the password), and tap *Turn on notifications*.
7. **Family joins**: *Me → Share invite link* gives a single-use link and QR code (7 days). The 8-character code still works and changes after each use. Owners can change roles, remove people and hand over the home.
8. **Shortcuts**: follow *Me → iPhone setup*:
   - an *Alarm is stopped* automation → your private wake URL
   - a *Brain Set Alarm* shortcut, so alarm buttons set real alarms

## Scripts

```bash
npm run dev        # dev server
npm test           # engine unit tests (vitest)
npm run typecheck
npm run lint
npm run build
```

Test the engine by hand:

```bash
curl -X POST "$APP/api/engine/tick" -H "Authorization: Bearer $CRON_SECRET"
curl -X POST "$APP/api/hooks/event?type=wake&token=<hook token from Me → iPhone setup>"
```

## Roadmap

The 1.0 roadmap (tickets 0.1–3.13) is tracked in the roadmap artifact. Still open:

- Kid profiles with PIN and a chore chart with points (3.2)
- Bills and receipts by forwarding email (3.11), and opt-in AI help (3.12)
- Ready-made iCloud Shortcuts, a VoiceOver pass, and an install guide with screenshots
- Automatic WhatsApp/SMS via Twilio or the WhatsApp Cloud API (today: prefilled tap-to-send)
