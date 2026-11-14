-- Adds optional email and notification data. Existing cards and vouchers are not changed.
create extension if not exists pgcrypto;

alter table public.clients add column if not exists email text;
alter table public.gift_vouchers add column if not exists recipient_email text;

create table if not exists public.notification_settings (
  id text primary key default 'main',
  card_half_year_days integer not null default 183 check (card_half_year_days between 1 and 365),
  card_expiry_days integer not null default 30 check (card_expiry_days between 1 and 365),
  gift_expiry_days integer not null default 30 check (gift_expiry_days between 1 and 365),
  notify_card_purchase boolean not null default true,
  notify_gift_purchase boolean not null default true,
  notify_card_transactions boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id)
values ('main')
on conflict (id) do nothing;

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('card', 'gift')),
  resource_id uuid not null,
  notification_type text not null,
  dedupe_key text not null unique,
  recipient text not null,
  subject text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;
alter table public.notification_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_settings'
      and policyname = 'Authenticated users manage notification settings'
  ) then
    create policy "Authenticated users manage notification settings"
    on public.notification_settings for all to authenticated
    using (true) with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_log'
      and policyname = 'Authenticated users read notification log'
  ) then
    create policy "Authenticated users read notification log"
    on public.notification_log for select to authenticated using (true);
  end if;
end;
$$;

create or replace function public.update_client_email_by_token(p_token text, p_email text)
returns table (id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.clients
  set email = nullif(trim(p_email), '')
  where view_token = p_token
  returning clients.id, clients.email;
end;
$$;

grant execute on function public.update_client_email_by_token(text, text) to anon, authenticated;

create or replace function public.get_client_email_by_token(p_token text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.clients where view_token = p_token limit 1;
$$;

grant execute on function public.get_client_email_by_token(text) to anon, authenticated;
