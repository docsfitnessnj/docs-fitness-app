import { createClient } from '@supabase/supabase-js';

// This app is a static site with no server (see supabase/setup.sql for the
// full backend) — every Supabase call goes straight from the browser, which
// is exactly what the publishable (anon) key below is for. It only ever
// grants what Row Level Security explicitly allows, so it's safe to commit.
// NEVER put a service role / secret key here or anywhere else in this repo.
const SUPABASE_URL = 'https://qooezwnskaqvmquydijg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NY6-jOLbU06obIonOevItg_fMs_VGqs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Keeps a signed-in member signed in across visits/app opens (fixes the
    // "asked to sign in every time" bug) — supabase-js persists the session
    // to the browser's localStorage and silently refreshes it by default.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// True once we've conclusively learned the backend is unreachable or the
// schema from supabase/setup.sql hasn't been run yet (missing table/relation
// errors) — every data context checks this so the app can show one calm,
// consistent message instead of crashing or hanging on a blank screen.
export function isBackendUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  // PostgREST: 42P01 = undefined_table, PGRST205 = table not in schema
  // cache (both mean "setup.sql hasn't been run yet" in this app's case).
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const message = (err.message ?? '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('could not find the table') ||
    message.includes('relation') && message.includes('does not exist')
  );
}

// Error-honesty pass (DOC'S GROUP CHAT, this round): a failed send/delete
// used to always say "check your connection" regardless of WHY it actually
// failed — a rejected upload (too large for the bucket's file_size_limit,
// wrong mime type, any other Supabase Storage rejection) got exactly the
// same blame-the-network copy as a real dropped connection, which is just
// false: the file reached Supabase fine, Supabase said no. This picks
// between three honest outcomes instead of one generic one: a genuine
// network/backend-unavailable failure keeps the connection copy (it's
// actually true there); a Supabase Storage rejection (`__isStorageError` —
// set on every StorageError subclass @supabase/storage-js throws,
// including the ones `.upload()` rejects with) says what Storage itself
// reported, in something closer to plain words for the couple of shapes
// worth naming specifically; anything else falls back to a flatly honest
// "something went wrong," never blaming connectivity it has no evidence
// points to.
export function describeChatFailure(error: unknown, fallback: string): string {
  if (isBackendUnavailableError(error)) {
    return fallback;
  }
  const err = (error ?? {}) as { message?: string; __isStorageError?: boolean };
  const message = err.message ?? '';
  if (err.__isStorageError) {
    if (/exceeded the maximum allowed size/i.test(message)) {
      return "That file is too big to send.";
    }
    if (/mime type|not supported|invalid (file|mime)/i.test(message)) {
      return "That file type isn't supported here.";
    }
    return message ? `Couldn't send that: ${message}` : "Couldn't send that — something went wrong with the upload.";
  }
  return message ? `Didn't go through: ${message}` : 'Something went wrong — try again.';
}

// @supabase/storage-js's own `.upload()` is built on `fetch()`, which has
// no upload-progress API — confirmed by reading the installed package
// (StorageFileApi.uploadOrUpdate, dist/index.cjs): it POSTs a FormData body
// to `${storageUrl}/object/${bucket}/${path}` with `apikey` + a bearer
// token @supabase/supabase-js injects per-request from the current session
// (fetchWithAuth in its own dist/index.cjs), and that's it — no hook a
// caller can observe bytes-sent through. This function sends the exact
// same request — same URL shape, same multipart body (a `cacheControl`
// field plus the file itself under the empty-string field name storage-js
// uses), same headers — over a raw XMLHttpRequest instead, purely so
// `xhr.upload.onprogress` can report real progress to the caller. Used by
// useGroupChat.ts's uploadGroupChatFile for the one upload worth showing
// progress on (a 20-30 second video); falls back to the plain
// supabase.storage upload (and an indeterminate animation in the UI) if a
// session token isn't available for any reason — see uploadGroupChatFile's
// own catch branch, which never lets that fallback swallow a real upload
// failure, only the inability to show real progress for one.
export async function uploadFileWithProgress(
  bucket: string,
  path: string,
  blob: Blob,
  cacheControlSeconds: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('No session available for a progress-tracked upload');
  }

  const formData = new FormData();
  formData.append('cacheControl', cacheControlSeconds);
  formData.append('', blob);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('apikey', SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    // Matches storage-js's own header for a plain (non-upsert) upload.
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      let message = `Upload failed with status ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message || body.error || message;
      } catch {
        // Non-JSON error body — keep the generic message.
      }
      const error = new Error(message) as Error & { __isStorageError: true; status: number; statusCode: string };
      error.__isStorageError = true;
      error.status = xhr.status;
      error.statusCode = String(xhr.status);
      reject(error);
    };
    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.send(formData);
  });
}
