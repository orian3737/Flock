-- ============================================================
-- Observation & Animal Tracking Tables
-- Sprint 3 — individual animal tracking, health logs, observations
-- ============================================================

-- ── New tables ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.animals (
  id                  serial          PRIMARY KEY,
  flock_id            integer         NOT NULL REFERENCES public.flocks(id) ON DELETE CASCADE,
  identifier          text            NOT NULL,
  sex                 text            NOT NULL DEFAULT 'unknown'
                        CHECK (sex IN ('male', 'female', 'unknown')),
  status              text            NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'sold', 'deceased', 'culled')),
  source              text            NOT NULL DEFAULT 'other'
                        CHECK (source IN ('hatched', 'purchased', 'born', 'other')),
  date_of_birth       date,
  date_acquired       date,
  sire_id             integer         REFERENCES public.animals(id) ON DELETE SET NULL,
  dam_id              integer         REFERENCES public.animals(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.observation_logs (
  id                  serial          PRIMARY KEY,
  flock_id            integer         NOT NULL REFERENCES public.flocks(id) ON DELETE CASCADE,
  animal_id           integer         REFERENCES public.animals(id) ON DELETE SET NULL,
  date                date            NOT NULL DEFAULT CURRENT_DATE,
  category            text            NOT NULL DEFAULT 'general'
                        CHECK (category IN ('feed_intake', 'water_intake', 'behavior', 'physical', 'environment', 'general')),
  detail              text,
  severity            text            NOT NULL DEFAULT 'normal'
                        CHECK (severity IN ('normal', 'concern', 'urgent')),
  follow_up_needed    boolean         NOT NULL DEFAULT false,
  follow_up_resolved  boolean         NOT NULL DEFAULT false,
  created_by          integer         REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.animal_health_logs (
  id                  serial          PRIMARY KEY,
  animal_id           integer         NOT NULL REFERENCES public.animals(id) ON DELETE CASCADE,
  observation_id      integer         REFERENCES public.observation_logs(id) ON DELETE SET NULL,
  date                date            NOT NULL DEFAULT CURRENT_DATE,
  log_type            text            NOT NULL DEFAULT 'observation'
                        CHECK (log_type IN ('observation', 'treatment', 'injury', 'illness', 'recovery', 'other')),
  description         text,
  resolved            boolean         NOT NULL DEFAULT false,
  resolved_at         date,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.animal_weight_logs (
  id                  serial          PRIMARY KEY,
  animal_id           integer         NOT NULL REFERENCES public.animals(id) ON DELETE CASCADE,
  date                date            NOT NULL DEFAULT CURRENT_DATE,
  weight_lbs          numeric(8, 3)   NOT NULL CHECK (weight_lbs > 0),
  input_method        text            NOT NULL DEFAULT 'manual'
                        CHECK (input_method IN ('manual', 'scale')),
  notes               text,
  created_at          timestamptz     NOT NULL DEFAULT now()
);

-- Add individual tracking flag to flocks (safe if already exists)
ALTER TABLE public.flocks
  ADD COLUMN IF NOT EXISTS individual_tracking_enabled boolean NOT NULL DEFAULT false;

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS animals_flock_id_idx           ON public.animals(flock_id);
CREATE INDEX IF NOT EXISTS animals_status_idx             ON public.animals(status);
CREATE INDEX IF NOT EXISTS observation_logs_flock_id_idx  ON public.observation_logs(flock_id);
CREATE INDEX IF NOT EXISTS observation_logs_date_idx      ON public.observation_logs(date);
CREATE INDEX IF NOT EXISTS observation_logs_severity_idx  ON public.observation_logs(severity);
CREATE INDEX IF NOT EXISTS observation_logs_follow_up_idx ON public.observation_logs(follow_up_needed, follow_up_resolved);
CREATE INDEX IF NOT EXISTS animal_health_logs_animal_idx  ON public.animal_health_logs(animal_id);
CREATE INDEX IF NOT EXISTS animal_weight_logs_animal_idx  ON public.animal_weight_logs(animal_id);
CREATE INDEX IF NOT EXISTS animal_weight_logs_date_idx    ON public.animal_weight_logs(date);

-- ── Enable RLS ────────────────────────────────────────────────

ALTER TABLE public.animals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_health_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_weight_logs   ENABLE ROW LEVEL SECURITY;

-- ── Helper function: animal ownership ────────────────────────

CREATE OR REPLACE FUNCTION public.user_owns_animal(p_animal_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM animals a
    WHERE a.id = p_animal_id
      AND user_owns_flock(a.flock_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_animal(integer) TO authenticated;

-- ── RLS Policies: animals ─────────────────────────────────────

DROP POLICY IF EXISTS "animals_select_update_delete" ON public.animals;
DROP POLICY IF EXISTS "animals_insert"               ON public.animals;

CREATE POLICY "animals_select_update_delete" ON public.animals
  FOR ALL
  USING (user_owns_flock(flock_id));

CREATE POLICY "animals_insert" ON public.animals
  FOR INSERT TO authenticated
  WITH CHECK (user_owns_flock(flock_id));

-- ── RLS Policies: observation_logs ───────────────────────────

DROP POLICY IF EXISTS "observation_logs_select_update_delete" ON public.observation_logs;
DROP POLICY IF EXISTS "observation_logs_insert"               ON public.observation_logs;

CREATE POLICY "observation_logs_select_update_delete" ON public.observation_logs
  FOR ALL
  USING (user_owns_flock(flock_id));

CREATE POLICY "observation_logs_insert" ON public.observation_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_owns_flock(flock_id));

-- ── RLS Policies: animal_health_logs ─────────────────────────

DROP POLICY IF EXISTS "animal_health_logs_select_update_delete" ON public.animal_health_logs;
DROP POLICY IF EXISTS "animal_health_logs_insert"               ON public.animal_health_logs;

CREATE POLICY "animal_health_logs_select_update_delete" ON public.animal_health_logs
  FOR ALL
  USING (user_owns_animal(animal_id));

CREATE POLICY "animal_health_logs_insert" ON public.animal_health_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_owns_animal(animal_id));

-- ── RLS Policies: animal_weight_logs ─────────────────────────

DROP POLICY IF EXISTS "animal_weight_logs_select_update_delete" ON public.animal_weight_logs;
DROP POLICY IF EXISTS "animal_weight_logs_insert"               ON public.animal_weight_logs;

CREATE POLICY "animal_weight_logs_select_update_delete" ON public.animal_weight_logs
  FOR ALL
  USING (user_owns_animal(animal_id));

CREATE POLICY "animal_weight_logs_insert" ON public.animal_weight_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_owns_animal(animal_id));
