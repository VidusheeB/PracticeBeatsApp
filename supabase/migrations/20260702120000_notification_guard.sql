-- Relevance-guard delivery model for scheduled_notifications.
-- Adds `type` (which guard to run) and `status` (pending -> sent | suppressed),
-- replacing the old `sent` boolean. A suppressed row is one the guard cancelled
-- at delivery time because it was no longer relevant (task done/deleted).

alter table scheduled_notifications
  add column if not exists type   text not null default 'task_reminder',
  add column if not exists status text not null default 'pending';

-- Carry the legacy `sent` flag over to the new status column, then drop it.
update scheduled_notifications set status = case when sent then 'sent' else 'pending' end;
alter table scheduled_notifications drop column if exists sent;

alter table scheduled_notifications
  drop constraint if exists scheduled_notifications_type_chk,
  drop constraint if exists scheduled_notifications_status_chk;
alter table scheduled_notifications
  add constraint scheduled_notifications_type_chk
    check (type in ('task_reminder', 'event_reminder', 'streak_nudge')),
  add constraint scheduled_notifications_status_chk
    check (status in ('pending', 'sent', 'suppressed'));

-- The worker scans (status = 'pending' AND send_at <= now) every minute.
create index if not exists scheduled_notifications_due_idx
  on scheduled_notifications (status, send_at);
