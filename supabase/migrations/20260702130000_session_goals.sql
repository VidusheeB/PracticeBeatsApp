-- Persists the 3 mandatory session goals + whether each was accomplished,
-- so they survive app restarts and can seed the auto-created reflection entry.
-- Shape: [{ "text": "...", "accomplished": true | false | null }, ...]

alter table practice_sessions
  add column if not exists goals jsonb not null default '[]'::jsonb;
