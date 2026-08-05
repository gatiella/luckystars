-- Hide the placeholder social tasks until real channel/X links exist.
-- Run: psql "$DATABASE_URL" -f 006_deactivate_placeholder_tasks.sql

UPDATE tasks SET active = FALSE
WHERE target_url IN ('https://t.me/your_channel', 'https://x.com/your_handle');
