// Multiplayer config. Both values are PUBLIC (safe to commit in a static site).
// Leave `key` empty to run in local-only mode (browser save, no shared rooms).
//
// - url: your Supabase Project URL
// - key: your Supabase *publishable* key (starts with `sb_publishable_`) —
//        NOT the secret/service_role key.
export const SUPABASE = {
  url: 'https://eiblnodsbdcmjbmynnbj.supabase.co',
  key: 'sb_publishable_PNuXaDwEXG50pa2f34LRWQ_kVNrPbJT', // public browser key — safe to commit
};

// Default room when the URL has no ?room=… . Share a link with the same room to
// collaborate; use ?room=something-else for a separate space.
export const DEFAULT_ROOM = 'potomac-3';
