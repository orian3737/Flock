-- Flock V2 product boundary:
-- keep cost tracking, price benchmarks, and yield data;
-- remove actual revenue/sales/P&L records.

-- Drop actual sales transaction tables.
DROP TABLE IF EXISTS public.revenues CASCADE;
DROP TABLE IF EXISTS public.young_sales CASCADE;
DROP TABLE IF EXISTS public.milk_sales CASCADE;

-- Keep financial_records as a cost rollup only.
ALTER TABLE IF EXISTS public.financial_records
  DROP COLUMN IF EXISTS total_revenue,
  DROP COLUMN IF EXISTS net_pl,
  DROP COLUMN IF EXISTS revenue_source;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_records'
      AND column_name = 'cost_per_bird'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'financial_records'
      AND column_name = 'cost_per_animal'
  ) THEN
    ALTER TABLE public.financial_records
      RENAME COLUMN cost_per_bird TO cost_per_animal;
  END IF;
END $$;

-- Feeding events may have carried the same historical name in early schemas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feeding_events'
      AND column_name = 'cost_per_bird'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feeding_events'
      AND column_name = 'cost_per_animal'
  ) THEN
    ALTER TABLE public.feeding_events
      RENAME COLUMN cost_per_bird TO cost_per_animal;
  END IF;
END $$;

-- Market references only. These are not revenue entries.
ALTER TABLE IF EXISTS public.flocks
  ADD COLUMN IF NOT EXISTS egg_price_per_dozen FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meat_price_per_lb   FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meat_price_per_bird FLOAT DEFAULT 0;

-- Verification helpers for Supabase SQL Editor.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'financial_records'
ORDER BY ordinal_position;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'flocks'
ORDER BY ordinal_position;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
