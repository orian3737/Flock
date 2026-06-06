-- ============================================================
-- RLS, Triggers, and Side-Effect Automation
-- ============================================================
-- Enables row-level security on all farm tables, adds policies
-- so each user only sees their own data, and adds Postgres
-- triggers to replicate the Python-side SQLAlchemy event
-- listeners that Flask was running.

-- ============================================================
-- SECTION 1: Enable RLS
-- ============================================================

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_classes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breeds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flocks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feeding_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casualty_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breeding_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_records   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 2: Helper functions for indirect ownership checks
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_owns_flock(p_flock_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM flocks f
    JOIN breeds b ON b.id = f.breed_id
    JOIN animal_classes ac ON ac.id = b.animal_class_id
    WHERE f.id = p_flock_id
      AND ac.user_id = current_app_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.user_owns_breed(p_breed_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM breeds b
    JOIN animal_classes ac ON ac.id = b.animal_class_id
    WHERE b.id = p_breed_id
      AND ac.user_id = current_app_user_id()
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_flock(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_breed(integer) TO authenticated;

-- ============================================================
-- SECTION 3: RLS Policies
-- ============================================================

-- users: own row only
DROP POLICY IF EXISTS "users_own" ON public.users;
CREATE POLICY "users_own" ON public.users
  FOR ALL TO authenticated
  USING (id = current_app_user_id())
  WITH CHECK (id = current_app_user_id());

-- animal_classes: direct user_id ownership
DROP POLICY IF EXISTS "animal_classes_own" ON public.animal_classes;
CREATE POLICY "animal_classes_own" ON public.animal_classes
  FOR ALL TO authenticated
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- breeds: split by operation because INSERT needs to check the parent animal_class,
-- not the breed id (which doesn't exist yet on INSERT).
DROP POLICY IF EXISTS "breeds_own" ON public.breeds;
DROP POLICY IF EXISTS "breeds_select_update_delete" ON public.breeds;
DROP POLICY IF EXISTS "breeds_update" ON public.breeds;
DROP POLICY IF EXISTS "breeds_delete" ON public.breeds;
DROP POLICY IF EXISTS "breeds_insert" ON public.breeds;

CREATE POLICY "breeds_select_update_delete" ON public.breeds
  FOR SELECT USING (user_owns_breed(id));

CREATE POLICY "breeds_update" ON public.breeds
  FOR UPDATE
  USING (user_owns_breed(id))
  WITH CHECK (user_owns_breed(id));

CREATE POLICY "breeds_delete" ON public.breeds
  FOR DELETE USING (user_owns_breed(id));

CREATE POLICY "breeds_insert" ON public.breeds
  FOR INSERT TO authenticated
  WITH CHECK (
    animal_class_id IN (
      SELECT id FROM animal_classes WHERE user_id = current_app_user_id()
    )
  );

-- flocks: indirect via breeds → animal_classes
DROP POLICY IF EXISTS "flocks_select_update_delete" ON public.flocks;
DROP POLICY IF EXISTS "flocks_update" ON public.flocks;
DROP POLICY IF EXISTS "flocks_delete" ON public.flocks;
DROP POLICY IF EXISTS "flocks_insert" ON public.flocks;

CREATE POLICY "flocks_select_update_delete" ON public.flocks
  FOR SELECT USING (user_owns_flock(id));

CREATE POLICY "flocks_update" ON public.flocks
  FOR UPDATE
  USING (user_owns_flock(id))
  WITH CHECK (user_owns_flock(id));

CREATE POLICY "flocks_delete" ON public.flocks
  FOR DELETE USING (user_owns_flock(id));

CREATE POLICY "flocks_insert" ON public.flocks
  FOR INSERT TO authenticated
  WITH CHECK (
    breed_id IN (
      SELECT b.id FROM breeds b
      JOIN animal_classes ac ON ac.id = b.animal_class_id
      WHERE ac.user_id = current_app_user_id()
    )
  );

-- feed_types: direct user_id ownership
DROP POLICY IF EXISTS "feed_types_own" ON public.feed_types;
CREATE POLICY "feed_types_own" ON public.feed_types
  FOR ALL TO authenticated
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- feed_assignments: flock must belong to user AND feed_type must belong to user
DROP POLICY IF EXISTS "feed_assignments_select_delete" ON public.feed_assignments;
DROP POLICY IF EXISTS "feed_assignments_delete" ON public.feed_assignments;
DROP POLICY IF EXISTS "feed_assignments_insert" ON public.feed_assignments;

CREATE POLICY "feed_assignments_select_delete" ON public.feed_assignments
  FOR SELECT USING (user_owns_flock(flock_id));

CREATE POLICY "feed_assignments_delete" ON public.feed_assignments
  FOR DELETE USING (user_owns_flock(flock_id));

CREATE POLICY "feed_assignments_insert" ON public.feed_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_owns_flock(flock_id)
    AND feed_type_id IN (SELECT id FROM feed_types WHERE user_id = current_app_user_id())
  );

-- feeding_events: flock must belong to user; feed_type must belong to user on insert
DROP POLICY IF EXISTS "feeding_events_select_delete" ON public.feeding_events;
DROP POLICY IF EXISTS "feeding_events_update" ON public.feeding_events;
DROP POLICY IF EXISTS "feeding_events_delete" ON public.feeding_events;
DROP POLICY IF EXISTS "feeding_events_insert" ON public.feeding_events;

CREATE POLICY "feeding_events_select_delete" ON public.feeding_events
  FOR SELECT USING (user_owns_flock(flock_id));

CREATE POLICY "feeding_events_update" ON public.feeding_events
  FOR UPDATE
  USING (user_owns_flock(flock_id))
  WITH CHECK (user_owns_flock(flock_id));

CREATE POLICY "feeding_events_delete" ON public.feeding_events
  FOR DELETE USING (user_owns_flock(flock_id));

CREATE POLICY "feeding_events_insert" ON public.feeding_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_owns_flock(flock_id)
    AND feed_type_id IN (SELECT id FROM feed_types WHERE user_id = current_app_user_id())
  );

-- production_logs: via flock ownership
DROP POLICY IF EXISTS "production_logs_select" ON public.production_logs;
DROP POLICY IF EXISTS "production_logs_insert" ON public.production_logs;
DROP POLICY IF EXISTS "production_logs_delete" ON public.production_logs;

CREATE POLICY "production_logs_select" ON public.production_logs
  FOR SELECT USING (user_owns_flock(flock_id));

CREATE POLICY "production_logs_insert" ON public.production_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_owns_flock(flock_id));

CREATE POLICY "production_logs_delete" ON public.production_logs
  FOR DELETE USING (user_owns_flock(flock_id));

-- casualty_logs: via flock ownership
DROP POLICY IF EXISTS "casualty_logs_select" ON public.casualty_logs;
DROP POLICY IF EXISTS "casualty_logs_insert" ON public.casualty_logs;
DROP POLICY IF EXISTS "casualty_logs_delete" ON public.casualty_logs;

CREATE POLICY "casualty_logs_select" ON public.casualty_logs
  FOR SELECT USING (user_owns_flock(flock_id));

CREATE POLICY "casualty_logs_insert" ON public.casualty_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_owns_flock(flock_id));

CREATE POLICY "casualty_logs_delete" ON public.casualty_logs
  FOR DELETE USING (user_owns_flock(flock_id));

-- breeding_logs: primary flock_id is the ownership anchor
DROP POLICY IF EXISTS "breeding_logs_own" ON public.breeding_logs;
CREATE POLICY "breeding_logs_own" ON public.breeding_logs
  FOR ALL TO authenticated
  USING (user_owns_flock(flock_id))
  WITH CHECK (user_owns_flock(flock_id));

-- inventory_transactions: via feed_type ownership
DROP POLICY IF EXISTS "inventory_transactions_select" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_insert" ON public.inventory_transactions;

CREATE POLICY "inventory_transactions_select" ON public.inventory_transactions
  FOR SELECT
  USING (
    feed_type_id IN (SELECT id FROM feed_types WHERE user_id = current_app_user_id())
  );

CREATE POLICY "inventory_transactions_insert" ON public.inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    feed_type_id IN (SELECT id FROM feed_types WHERE user_id = current_app_user_id())
  );

-- alerts: direct user_id ownership
DROP POLICY IF EXISTS "alerts_own" ON public.alerts;
CREATE POLICY "alerts_own" ON public.alerts
  FOR ALL TO authenticated
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- revenues: direct user_id ownership
DROP POLICY IF EXISTS "revenues_own" ON public.revenues;
CREATE POLICY "revenues_own" ON public.revenues
  FOR ALL TO authenticated
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

-- financial_records: via flock ownership
DROP POLICY IF EXISTS "financial_records_own" ON public.financial_records;
CREATE POLICY "financial_records_own" ON public.financial_records
  FOR ALL TO authenticated
  USING (user_owns_flock(flock_id));

-- ============================================================
-- SECTION 4: Trigger — sync feed_types.cost_per_unit
-- ============================================================
-- Flask kept cost_per_unit in sync via a before_insert/before_update
-- SQLAlchemy listener. We replicate this as a Postgres trigger.

CREATE OR REPLACE FUNCTION public.sync_feed_cost_per_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bag_weight IS NOT NULL AND NEW.bag_weight > 0 THEN
    NEW.cost_per_unit := ROUND((NEW.bag_price / NEW.bag_weight)::numeric, 4);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_types_sync_cost ON public.feed_types;
CREATE TRIGGER feed_types_sync_cost
  BEFORE INSERT OR UPDATE OF bag_weight, bag_price ON public.feed_types
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_feed_cost_per_unit();

-- ============================================================
-- SECTION 5: Trigger — casualty_logs updates flock headcount
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_casualty_headcount_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.flocks
  SET current_headcount = current_headcount + NEW.change_amount
  WHERE id = NEW.flock_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS casualty_log_apply_headcount ON public.casualty_logs;
CREATE TRIGGER casualty_log_apply_headcount
  AFTER INSERT ON public.casualty_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_casualty_headcount_change();

-- ============================================================
-- SECTION 6: Trigger — lock feeding_event cost before insert
-- ============================================================

CREATE OR REPLACE FUNCTION public.lock_feeding_event_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bag_weight  float;
  v_bag_price   float;
  v_cost_per_unit float;
BEGIN
  IF NEW.cost_per_lb_at_time IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT bag_weight, bag_price, cost_per_unit
  INTO v_bag_weight, v_bag_price, v_cost_per_unit
  FROM public.feed_types
  WHERE id = NEW.feed_type_id;

  IF v_bag_weight IS NOT NULL AND v_bag_weight > 0 THEN
    NEW.cost_per_lb_at_time := ROUND((v_bag_price / v_bag_weight)::numeric, 4);
  ELSE
    NEW.cost_per_lb_at_time := v_cost_per_unit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feeding_event_lock_cost ON public.feeding_events;
CREATE TRIGGER feeding_event_lock_cost
  BEFORE INSERT ON public.feeding_events
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_feeding_event_cost();

-- ============================================================
-- SECTION 7: Trigger — debit inventory after feeding_event insert
-- ============================================================

CREATE OR REPLACE FUNCTION public.debit_feed_on_feeding_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       integer;
  v_feed_name     text;
  v_par_level     float;
  v_on_hand       float;
BEGIN
  -- Debit feed inventory and capture updated values in one statement
  UPDATE public.feed_types
  SET current_on_hand = current_on_hand - NEW.total_weight
  WHERE id = NEW.feed_type_id
  RETURNING user_id, name, par_level, current_on_hand
  INTO v_user_id, v_feed_name, v_par_level, v_on_hand;

  -- Record the feeding transaction
  INSERT INTO public.inventory_transactions (
    feed_type_id, date, transaction_type, quantity_change,
    unit_cost, cost_per_lb, notes
  ) VALUES (
    NEW.feed_type_id,
    NEW.date,
    'feeding',
    -NEW.total_weight,
    NEW.cost_per_lb_at_time,
    NEW.cost_per_lb_at_time,
    'Auto-created from feeding event ' || NEW.id
  );

  -- Generate low-feed alert if at or below par
  IF v_on_hand <= v_par_level THEN
    INSERT INTO public.alerts (user_id, feed_type_id, alert_type, message, is_read)
    VALUES (
      v_user_id,
      NEW.feed_type_id,
      'low_feed',
      v_feed_name || ' is at or below par level: '
        || ROUND(v_on_hand::numeric, 2) || ' on hand, par '
        || ROUND(v_par_level::numeric, 2) || '.',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feeding_event_debit_inventory ON public.feeding_events;
CREATE TRIGGER feeding_event_debit_inventory
  AFTER INSERT ON public.feeding_events
  FOR EACH ROW
  EXECUTE FUNCTION public.debit_feed_on_feeding_event();

-- ============================================================
-- SECTION 8: Trigger — restore inventory on feeding_event delete
-- ============================================================

CREATE OR REPLACE FUNCTION public.restore_feed_on_feeding_event_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost float;
BEGIN
  SELECT COALESCE(OLD.cost_per_lb_at_time, cost_per_unit)
  INTO v_cost
  FROM public.feed_types
  WHERE id = OLD.feed_type_id;

  UPDATE public.feed_types
  SET current_on_hand = current_on_hand + OLD.total_weight
  WHERE id = OLD.feed_type_id;

  INSERT INTO public.inventory_transactions (
    feed_type_id, date, transaction_type, quantity_change,
    unit_cost, cost_per_lb, notes
  ) VALUES (
    OLD.feed_type_id,
    OLD.date,
    'adjustment',
    OLD.total_weight,
    v_cost,
    v_cost,
    'Deleted feeding event'
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS feeding_event_restore_on_delete ON public.feeding_events;
CREATE TRIGGER feeding_event_restore_on_delete
  BEFORE DELETE ON public.feeding_events
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_feed_on_feeding_event_delete();

-- ============================================================
-- SECTION 9: Trigger — adjust inventory on feeding_event weight/feed update
-- ============================================================

CREATE OR REPLACE FUNCTION public.adjust_feed_on_feeding_event_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_cost      float;
  v_new_cost      float;
  v_new_on_hand   float;
  v_par_level     float;
  v_user_id       integer;
  v_feed_name     text;
BEGIN
  -- Skip if nothing that affects inventory actually changed
  IF NEW.total_weight = OLD.total_weight AND NEW.feed_type_id = OLD.feed_type_id THEN
    RETURN NEW;
  END IF;

  -- Get old feed cost
  SELECT COALESCE(OLD.cost_per_lb_at_time, cost_per_unit)
  INTO v_old_cost
  FROM public.feed_types
  WHERE id = OLD.feed_type_id;

  -- Restore old feed inventory
  UPDATE public.feed_types
  SET current_on_hand = current_on_hand + OLD.total_weight
  WHERE id = OLD.feed_type_id;

  INSERT INTO public.inventory_transactions (
    feed_type_id, date, transaction_type, quantity_change, unit_cost, cost_per_lb, notes
  ) VALUES (
    OLD.feed_type_id, NEW.date, 'adjustment', OLD.total_weight, v_old_cost, v_old_cost,
    'Adjusted feeding event ' || OLD.id || ': restored previous weight'
  );

  -- Get new feed cost
  SELECT cost_per_unit
  INTO v_new_cost
  FROM public.feed_types
  WHERE id = NEW.feed_type_id;

  NEW.cost_per_lb_at_time := v_new_cost;

  -- Debit new feed inventory
  UPDATE public.feed_types
  SET current_on_hand = current_on_hand - NEW.total_weight
  WHERE id = NEW.feed_type_id
  RETURNING current_on_hand, par_level, user_id, name
  INTO v_new_on_hand, v_par_level, v_user_id, v_feed_name;

  INSERT INTO public.inventory_transactions (
    feed_type_id, date, transaction_type, quantity_change, unit_cost, cost_per_lb, notes
  ) VALUES (
    NEW.feed_type_id, NEW.date, 'adjustment', -NEW.total_weight, v_new_cost, v_new_cost,
    'Adjusted feeding event ' || NEW.id || ': applied updated weight'
  );

  -- Generate low-feed alert if needed
  IF v_new_on_hand <= v_par_level THEN
    INSERT INTO public.alerts (user_id, feed_type_id, alert_type, message, is_read)
    VALUES (
      v_user_id, NEW.feed_type_id, 'low_feed',
      v_feed_name || ' is at or below par level: '
        || ROUND(v_new_on_hand::numeric, 2) || ' on hand, par '
        || ROUND(v_par_level::numeric, 2) || '.',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feeding_event_adjust_inventory ON public.feeding_events;
CREATE TRIGGER feeding_event_adjust_inventory
  BEFORE UPDATE OF total_weight, feed_type_id ON public.feeding_events
  FOR EACH ROW
  EXECUTE FUNCTION public.adjust_feed_on_feeding_event_update();

-- ============================================================
-- SECTION 10: RPC — purchase_feed (atomic: update feed + insert transaction + clear alerts)
-- ============================================================
-- The feeding_event triggers create 'adjustment' inventory_transaction rows for their
-- own reversal entries. A trigger on inventory_transactions would double-apply those.
-- Instead, purchases and adjustments are handled by explicit RPC functions called from
-- the frontend, keeping the trigger graph simple.

CREATE OR REPLACE FUNCTION public.purchase_feed(
  p_feed_type_id  integer,
  p_num_bags      float,
  p_bag_weight    float,
  p_bag_price     float,
  p_date          date    DEFAULT CURRENT_DATE,
  p_supplier      text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total_quantity  float;
  v_cost_per_lb     float;
  v_notes           text;
  v_result          json;
BEGIN
  IF p_num_bags <= 0 OR p_bag_weight <= 0 THEN
    RAISE EXCEPTION 'num_bags and bag_weight must be greater than zero';
  END IF;

  v_total_quantity := p_num_bags * p_bag_weight;
  v_cost_per_lb    := ROUND((p_bag_price / p_bag_weight)::numeric, 4);
  v_notes          := p_num_bags || ' bag(s) @ $' || p_bag_price || ' / ' || p_bag_weight || ' lbs';
  IF p_supplier IS NOT NULL THEN
    v_notes := v_notes || ' - ' || p_supplier;
  END IF;

  UPDATE public.feed_types
  SET
    current_on_hand = current_on_hand + v_total_quantity,
    bag_weight      = p_bag_weight,
    bag_price       = p_bag_price
  WHERE id = p_feed_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feed type not found';
  END IF;

  INSERT INTO public.inventory_transactions (
    feed_type_id, date, transaction_type, quantity_change,
    unit_cost, bag_weight, bag_price, cost_per_lb, notes
  ) VALUES (
    p_feed_type_id, p_date, 'purchase', v_total_quantity,
    v_cost_per_lb, p_bag_weight, p_bag_price, v_cost_per_lb, v_notes
  );

  UPDATE public.alerts
  SET is_read = true
  WHERE feed_type_id = p_feed_type_id
    AND alert_type = 'low_feed'
    AND is_read = false;

  SELECT row_to_json(ft) INTO v_result
  FROM public.feed_types ft
  WHERE ft.id = p_feed_type_id;

  RETURN v_result;
END;
$$;

-- ============================================================
-- SECTION 11: RPC — adjust_feed (atomic: update feed + insert transaction)
-- ============================================================

CREATE OR REPLACE FUNCTION public.adjust_feed(
  p_feed_type_id    integer,
  p_quantity_change float,
  p_reason          text,
  p_date            date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cost_per_lb float;
  v_result      json;
BEGIN
  SELECT cost_per_unit INTO v_cost_per_lb
  FROM public.feed_types
  WHERE id = p_feed_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feed type not found';
  END IF;

  UPDATE public.feed_types
  SET current_on_hand = current_on_hand + p_quantity_change
  WHERE id = p_feed_type_id;

  INSERT INTO public.inventory_transactions (
    feed_type_id, date, transaction_type, quantity_change,
    unit_cost, cost_per_lb, notes
  ) VALUES (
    p_feed_type_id, p_date, 'adjustment', p_quantity_change,
    v_cost_per_lb, v_cost_per_lb, p_reason
  );

  SELECT row_to_json(ft) INTO v_result
  FROM public.feed_types ft
  WHERE ft.id = p_feed_type_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_feed(integer, float, float, float, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_feed(integer, float, text, date) TO authenticated;

-- ============================================================
-- SECTION 12: Revoke trigger function access from PUBLIC
-- ============================================================

REVOKE ALL ON FUNCTION public.sync_feed_cost_per_unit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_casualty_headcount_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_feeding_event_cost() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_feed_on_feeding_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_feed_on_feeding_event_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_feed_on_feeding_event_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_flock(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_owns_breed(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_owns_flock(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_breed(integer) TO authenticated;
