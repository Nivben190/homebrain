# Secrets

Every secret Home Brain uses: what it unlocks, where it lives, and how to rotate it.
Values live in `.env.local` (gitignored, excluded from deploys by `.vercelignore`) and in Vercel → Project → Environment Variables. Never in git.

Last checked 31 Oct 2026 (roadmap 1.12).

## Rules

- **Vercel holds only what the running app needs.** Personal tokens (`SUPABASE_ACCESS_TOKEN`, `VERCEL_OIDC_TOKEN`) stay in `.env.local` and never go to Vercel.
- **Every secret in Vercel is type Secret** (`vercel env add NAME production --sensitive`): nobody can read it back from the dashboard. `NEXT_PUBLIC_*` values ship to every browser, so they can't be secret and aren't.
- **A changed Vercel variable needs a redeploy**: `npx vercel deploy --prod --scope nivben190s-projects --yes`.
- After rotating, update `.env.local` too, so local runs and tests match production.

## Inventory

| Variable | Unlocks | Where | Leak means | Rotate |
| --- | --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | The whole database, ignoring row-level security. Also signs Shortcut launch tokens while `HOOK_LAUNCH_SECRET` is unset. | Vercel (Secret), `.env.local` | Full read/write of every home | [A](#a-supabase-service-role-key) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Nothing alone: every table is behind RLS. | Vercel (Config), browsers | Nothing extra | With A, if the project's JWT keys are rotated |
| `CRON_SECRET` | `/api/engine/tick`, `/api/cron/gmail`, `/api/cron/reseal`. | Vercel (Secret), `.env.local`, Supabase Vault `cron_secret` | Anyone can run the engine early or re-seal tokens (no data exposed) | [B](#b-cron_secret) |
| `GOOGLE_TOKEN_KEY` | Decrypts every stored Google refresh token (Gmail, Calendar) and the home info card's owner-only secrets. | Vercel (Secret), `.env.local` | With a database copy: read the connected Gmail inboxes and Calendars | [C](#c-google_token_key) |
| `GOOGLE_CLIENT_SECRET` | Exchanging Google sign-in codes for tokens. | Vercel (Secret), `.env.local` | Someone could pose as Home Brain to Google | [D](#d-google-oauth-client) |
| `GOOGLE_CLIENT_ID` | Names the OAuth client (public in every Google sign-in URL). | Vercel, `.env.local` | Nothing | With D |
| `VAPID_PRIVATE_KEY` | Sending Web Push to the subscribed phones. | Vercel (Secret), `.env.local` | Someone could send notifications to your phones | [E](#e-vapid-keys) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public half of the above. | Vercel (Config), browsers | Nothing | With E |
| `GEMINI_API_KEY` | Fridge photo scanning (Google AI Studio). | Vercel (Secret), `.env.local` | Usage billed to you or your quota used up | [F](#f-third-party-api-keys) |
| `RESEND_API_KEY` | Sending email (weekly check-in, Brain email actions, the new sign-up alert). | `.env.local` only, **not in Vercel**, so production sends no email yet | Mail sent as you | [F](#f-third-party-api-keys) |
| `HOOK_LAUNCH_SECRET` | Optional. Signs the 30-minute tokens the app hands a Shortcut it launches. Unset: the service role key signs them. | Not set | Forged launch tokens (one user, one purpose, 30 min) | Set any long random string and redeploy. Open launch tokens just expire. |
| `SUPABASE_DB_URL` | Direct Postgres access, password included, for the nightly backup. | GitHub Actions secret | Full database | [A](#a-supabase-service-role-key), step 4 |
| `BACKUP_PASSPHRASE` | Decrypts the nightly backup files. | GitHub Actions secret, plus your password manager | With a backup file: the whole database | [G](#g-backup_passphrase) |
| `SUPABASE_ACCESS_TOKEN` | Your personal Supabase account: every project, auth settings, migrations. | `.env.local` only. **Expired as of 31 Oct 2026.** | Your whole Supabase account | Supabase → Account → Access Tokens: revoke, create, paste into `.env.local` |
| `VERCEL_OIDC_TOKEN` | Short-lived token written by `vercel env pull`. | `.env.local` only | Expires within hours | Nothing to do |
| Shortcut keys (`hook_keys`) | One Shortcut each, per person and purpose. | Stored hashed in the database; the plain key lives only in the Shortcut | That one Shortcut's action | Me → iPhone setup → New key, then paste it into the Shortcut |

Not secret: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL`, `VAPID_SUBJECT`, `EMAIL_FROM`, `SIGNUP_ALERT_EMAIL` (who gets "New sign-up" emails; unset sends none), `ALLOWED_EMAILS`, `FRIDGE_MODEL`, `FRIDGE_FALLBACK_MODEL`, `NEXT_PUBLIC_NOTES_SHORTCUT_LINK`.

## How to rotate

Each one takes about 10 minutes. Afterwards, open the app and check that Me → Brain status still says it's running.

### A. Supabase service role key

1. Supabase → Project Settings → API Keys: create a new **secret** key (`sb_secret_…`), or roll the legacy JWT secret if the project still uses it (that also replaces the anon key).
2. `vercel env rm SUPABASE_SERVICE_ROLE_KEY production`, then `vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive`. Do the same for `NEXT_PUBLIC_SUPABASE_ANON_KEY` if it changed.
3. Redeploy, check `/api/health`, then delete the old key in Supabase.
4. If the database password leaked as well: Project Settings → Database → Reset password, then update `SUPABASE_DB_URL` in GitHub → Settings → Secrets → Actions.

### B. `CRON_SECRET`

pg_cron sends the Vault copy, and the app checks the Vercel copy, so change both within a minute or two. A few ticks may get a 401 in between, and the next minute catches up.

1. `openssl rand -base64 32`
2. Supabase SQL editor: `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<new value>');`
3. Vercel: replace `CRON_SECRET` (Secret), then redeploy.
4. Within a minute or two, `/api/health` shows a recent tick.

### C. `GOOGLE_TOKEN_KEY`

Stored tokens are sealed with this key, so the old key keeps working until everything is re-sealed. Nobody has to reconnect Google.

1. `openssl rand -base64 32` gives the new key.
2. In Vercel, set `GOOGLE_TOKEN_KEY_PREVIOUS` to the **current** value and `GOOGLE_TOKEN_KEY` to the new one (both Secret), then redeploy.
3. Re-seal everything:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://homebrain-jade.vercel.app/api/cron/reseal`
   Every table should report `unreadable: 0`. Run it twice: the second run should report `resealed: 0`.
4. Remove `GOOGLE_TOKEN_KEY_PREVIOUS` from Vercel, redeploy, and update `.env.local`.

### D. Google OAuth client

1. Google Cloud console → APIs & Services → Credentials → the Home Brain OAuth client → Add secret.
2. Vercel: replace `GOOGLE_CLIENT_SECRET`, then redeploy.
3. Connect a test Calendar from Me. If it works, disable the old secret in the console.

Stored refresh tokens keep working, because they belong to the client, not to the secret.

### E. VAPID keys

New VAPID keys invalidate every push subscription, so each phone must turn notifications on again.

1. `npx web-push generate-vapid-keys`
2. Vercel: replace `VAPID_PRIVATE_KEY` (Secret) and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Config), then redeploy.
3. On each phone: Me → Notifications → Enable, then Send test. Pushes to the old subscriptions fail and get pruned.

### F. Third-party API keys

Gemini (aistudio.google.com → API keys) and Resend (resend.com → API Keys): create a new key, replace it in Vercel (Secret), redeploy, test (scan the fridge or send a Brain email), then delete the old key.

### G. `BACKUP_PASSPHRASE`

Old backups stay encrypted with the old passphrase, so keep it in your password manager until those backups age out.

1. Generate a new passphrase and save it in your password manager.
2. GitHub → Settings → Secrets → Actions: replace `BACKUP_PASSPHRASE`.
3. Run the backup workflow by hand, and check that the new file decrypts with the new passphrase.

## If something leaked

Rotate it first, using the steps above. Then look at what it could have reached:

- Supabase → Logs: API requests that used the service role.
- Vercel → Logs: unexpected calls to `/api/cron/*`.
- Google Account → Security → Third-party access.
