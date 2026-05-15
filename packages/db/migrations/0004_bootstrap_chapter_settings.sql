INSERT INTO chapter_settings (key, value) VALUES
  ('admin_recipient_email',      to_jsonb(coalesce(current_setting('app.bootstrap_admin_recipient_email',      true), 'admins@example.invalid'))),
  ('treasurer_recipient_email',  to_jsonb(coalesce(current_setting('app.bootstrap_treasurer_recipient_email',  true), 'treasurer@example.invalid'))),
  ('moderators_recipient_email', to_jsonb(coalesce(current_setting('app.bootstrap_moderators_recipient_email', true), 'mods@example.invalid'))),
  ('chapter_timezone',           to_jsonb(coalesce(current_setting('app.bootstrap_chapter_timezone',           true), 'America/New_York'))),
  ('chapter_display_name',       to_jsonb(coalesce(current_setting('app.bootstrap_chapter_display_name',       true), 'Your Chapter')))
ON CONFLICT (key) DO NOTHING;
