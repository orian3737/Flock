-- Add selected_options to observation_logs
-- Stores preset quick-select option tags as a text array

ALTER TABLE public.observation_logs
  ADD COLUMN IF NOT EXISTS selected_options TEXT[] NOT NULL DEFAULT '{}';

-- Verify
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'observation_logs'
-- ORDER BY ordinal_position;
