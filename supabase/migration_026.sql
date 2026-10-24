-- Round 28: real Storage for Community post/WOD-result photos and videos.
--
-- Root cause of "photos don't render in the feed" / "old posts show blank
-- gray blocks": CommunityContext.tsx's addTextPost/addWodResultPost/
-- updateTextPost wrote a locally-picked attachment's `uri` straight into
-- `media_url` with no upload step at all. On web that `uri` is a
-- `URL.createObjectURL()` blob: URL, valid only inside the browser
-- document that created it (documented as a known, not-yet-fixed gap
-- since Round 18's AGENTS.md) -- it rendered fine for the posting member
-- in that same session, then came up blank for anyone else, or on reload,
-- or on a different device, which is exactly what a blank gray thumbnail
-- block is: an <Image> whose source URL never resolved.
--
-- This bucket is the fix's storage half -- the app-code half (uploading
-- before ever writing media_url) is in CommunityContext.tsx. Same shape as
-- the existing group-chat-media bucket (migration_012.sql/setup.sql):
-- public read, upload restricted to the uploader's own folder. No
-- has_group_chat_access()-style gating here, since posting to Community is
-- already open to every signed-in tier as of Round 27 -- any authenticated
-- member may upload into their own folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('community-media', 'community-media', true, 52428800)
on conflict (id) do nothing;

drop policy if exists "community post photos are publicly viewable" on storage.objects;
create policy "community post photos are publicly viewable"
  on storage.objects for select
  to public
  using (bucket_id = 'community-media');

drop policy if exists "a member uploads community media into their own folder" on storage.objects;
create policy "a member uploads community media into their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "the uploader or admin can delete a community media file" on storage.objects;
create policy "the uploader or admin can delete a community media file"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid()))
  );
