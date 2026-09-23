-- Doc's Fitness — migration 006
-- ============================================================================
-- Makes MESSAGE DOC real. Before this migration it was a fake screen —
-- nothing a member typed was ever saved or seen by anyone; it just lived in
-- that one browser tab until closed. This adds a real, private, member <->
-- Doc inbox: exactly one conversation thread per member, permanent database
-- rows for every message, and real read-tracking so the gold unread dots
-- (on the member's MESSAGE DOC row, and on Doc's new DOC'S INBOX list) are
-- true shared state, not a per-device guess. Scope is strictly member <->
-- Doc — there is no member-to-member messaging anywhere in this app, and
-- this migration doesn't add any.
--
-- Run this AFTER supabase/setup.sql. Safe to run once, and safe to re-run.
--
-- Doc: you must run this migration for MESSAGE DOC and DOC'S INBOX to work
-- at all — without it, both screens will show "Can't load this right now."
-- ============================================================================

create table if not exists public.doc_threads (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  member_last_read_at timestamptz not null default now(),
  admin_last_read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.doc_threads enable row level security;

drop policy if exists "a member reads their own thread, admin reads every thread" on public.doc_threads;
create policy "a member reads their own thread, admin reads every thread"
  on public.doc_threads for select
  to authenticated
  using (member_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "a member's thread is created by themselves or by admin" on public.doc_threads;
create policy "a member's thread is created by themselves or by admin"
  on public.doc_threads for insert
  to authenticated
  with check (member_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "a member marks their own thread read, admin marks any thread read" on public.doc_threads;
create policy "a member marks their own thread read, admin marks any thread read"
  on public.doc_threads for update
  to authenticated
  using (member_id = auth.uid() or public.is_admin(auth.uid()))
  with check (member_id = auth.uid() or public.is_admin(auth.uid()));

create table if not exists public.doc_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  voice_url text,
  voice_duration_ms integer,
  created_at timestamptz not null default now()
);

alter table public.doc_messages enable row level security;

drop policy if exists "a member reads their own thread's messages, admin reads every thread's messages" on public.doc_messages;
create policy "a member reads their own thread's messages, admin reads every thread's messages"
  on public.doc_messages for select
  to authenticated
  using (member_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "members write into their own thread as themselves, admin replies into any thread" on public.doc_messages;
create policy "members write into their own thread as themselves, admin replies into any thread"
  on public.doc_messages for insert
  to authenticated
  with check (sender_id = auth.uid() and (member_id = auth.uid() or public.is_admin(auth.uid())));

drop policy if exists "the sender or admin can unsend a message" on public.doc_messages;
create policy "the sender or admin can unsend a message"
  on public.doc_messages for delete
  to authenticated
  using (sender_id = auth.uid() or public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public)
values ('message-media', 'message-media', true)
on conflict (id) do nothing;

drop policy if exists "message attachments are publicly viewable" on storage.objects;
create policy "message attachments are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'message-media');

drop policy if exists "a member uploads into their own thread, admin uploads into any thread" on storage.objects;
create policy "a member uploads into their own thread, admin uploads into any thread"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );

drop policy if exists "the sender or admin can delete a message attachment" on storage.objects;
create policy "the sender or admin can delete a message attachment"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );
