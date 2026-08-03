-- The notification voice picker's new "Kuchupuchu" option wasn't persisting: the
-- notification_settings.humor_level CHECK constraint only allowed 'roast'/'plain',
-- so the write failed (23514) and the optimistic toggle reverted on reload.
-- (The client's settings update is fire-and-forget and doesn't surface errors,
-- which is why the failure was silent.) Widen the constraint.
alter table public.notification_settings drop constraint notification_settings_humor_level_check;
alter table public.notification_settings add constraint notification_settings_humor_level_check
  check (humor_level = any (array['roast'::text, 'plain'::text, 'kuchupuchu'::text]));
