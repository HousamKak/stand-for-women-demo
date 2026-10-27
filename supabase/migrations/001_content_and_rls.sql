-- Run in a client-owned Supabase project. This migration does not create users.
begin;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
create policy "Staff can check their own membership" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_content_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admins where user_id = (select auth.uid())); $$;
revoke all on function public.is_content_admin() from public;
grant execute on function public.is_content_admin() to anon, authenticated;

create table public.content_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('projects','partners','reports','testimonials','team')),
  title text not null check (length(title) between 1 and 500),
  slug text,
  status text not null default 'draft' check (status in ('draft','published')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_slug_required check (kind <> 'projects' or (slug is not null and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  unique (kind, slug)
);
create index content_entries_public_listing on public.content_entries (kind, status, created_at);
alter table public.content_entries enable row level security;
revoke all on public.content_entries from anon, authenticated;
grant select on public.content_entries to anon, authenticated;
grant insert, update, delete on public.content_entries to authenticated;
create policy "Published content is public; staff can read drafts" on public.content_entries
  for select to anon, authenticated
  using (status = 'published' or (select public.is_content_admin()));
create policy "Only content administrators can insert" on public.content_entries
  for insert to authenticated with check ((select public.is_content_admin()));
create policy "Only content administrators can update" on public.content_entries
  for update to authenticated using ((select public.is_content_admin()))
  with check ((select public.is_content_admin()));
create policy "Only content administrators can delete" on public.content_entries
  for delete to authenticated using ((select public.is_content_admin()));

create or replace function public.touch_content_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger update_content_timestamp before update on public.content_entries
  for each row execute function public.touch_content_updated_at();

create table public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(first_name) between 1 and 100),
  last_name text not null check (length(last_name) between 1 and 100),
  email text not null check (length(email) <= 254),
  interest text not null check (interest in ('general','volunteer','partnership','business','donation')),
  message text not null check (length(message) between 1 and 5000),
  created_at timestamptz not null default now()
);
alter table public.contact_submissions enable row level security;
revoke all on public.contact_submissions from anon, authenticated;
grant select, delete on public.contact_submissions to authenticated;
grant insert on public.contact_submissions to service_role;
create policy "Staff can read inquiries" on public.contact_submissions
  for select to authenticated using ((select public.is_content_admin()));
create policy "Staff can delete inquiries" on public.contact_submissions
  for delete to authenticated using ((select public.is_content_admin()));
-- The Worker validates and rate-limits public submissions, then inserts server-side.
-- No anonymous SELECT/INSERT grant. No client can grant itself administrator access.

commit;

-- After inviting a staff user, grant membership manually using the SQL editor:
-- insert into public.admins(user_id) values ('ACTUAL-AUTH-USER-UUID');
-- Disable public signups in Authentication settings; configure trusted redirect URLs.
