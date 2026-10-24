-- Per-space settings; Spending spaces keep the last 4 digits of the cards / accounts
-- whose purchases land in them: { "cards": ["1234"] }.
alter table public.sections add column if not exists settings jsonb not null default '{}'::jsonb;
