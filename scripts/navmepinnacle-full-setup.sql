-- ============================================================
-- NavMePinnacle — FULL DATABASE SETUP (paste into Supabase → SQL → Run)
-- Run once on a fresh project. If something already exists, you may see
-- benign errors; fix or skip that block.
-- Default login after seed: admin@pinnacle.com / PinnacleAdmin2024!
-- ============================================================

-- ── 0. Extensions ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Dashboard admins + login RPCs ────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_admins_email ON public.dashboard_admins (email);

CREATE OR REPLACE FUNCTION public.update_dashboard_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dashboard_admins_updated_at ON public.dashboard_admins;
CREATE TRIGGER dashboard_admins_updated_at
  BEFORE UPDATE ON public.dashboard_admins
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_admins_updated_at();

CREATE OR REPLACE VIEW public.dashboard_admins_safe AS
SELECT id, email, display_name, role, avatar_url, created_at, updated_at
FROM public.dashboard_admins;

CREATE OR REPLACE FUNCTION public.verify_admin_login(p_email TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
  v_admin RECORD;
BEGIN
  SELECT id, email, password_hash, display_name, role, avatar_url, created_at, updated_at
  INTO v_admin
  FROM public.dashboard_admins
  WHERE email = LOWER(TRIM(p_email));

  IF v_admin IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (v_admin.password_hash = crypt(p_password, v_admin.password_hash)) THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', v_admin.id,
    'email', v_admin.email,
    'display_name', v_admin.display_name,
    'role', v_admin.role,
    'avatar_url', v_admin.avatar_url,
    'created_at', v_admin.created_at,
    'updated_at', v_admin.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_admin_account(
  p_caller_id UUID,
  p_email TEXT,
  p_password TEXT,
  p_display_name TEXT,
  p_role TEXT DEFAULT 'admin'
)
RETURNS JSON AS $$
DECLARE
  v_caller RECORD;
  v_new_admin RECORD;
BEGIN
  SELECT id, role INTO v_caller
  FROM public.dashboard_admins
  WHERE id = p_caller_id;

  IF v_caller IS NULL OR v_caller.role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: only super_admin can create accounts';
  END IF;

  IF p_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO public.dashboard_admins (email, password_hash, display_name, role)
  VALUES (LOWER(TRIM(p_email)), crypt(p_password, gen_salt('bf', 10)), TRIM(p_display_name), p_role)
  RETURNING id, email, display_name, role, avatar_url, created_at, updated_at
  INTO v_new_admin;

  RETURN json_build_object(
    'id', v_new_admin.id,
    'email', v_new_admin.email,
    'display_name', v_new_admin.display_name,
    'role', v_new_admin.role,
    'avatar_url', v_new_admin.avatar_url,
    'created_at', v_new_admin.created_at,
    'updated_at', v_new_admin.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_admin_profile(
  p_admin_id UUID,
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_admin RECORD;
BEGIN
  UPDATE public.dashboard_admins
  SET
    display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url)
  WHERE id = p_admin_id
  RETURNING id, email, display_name, role, avatar_url, created_at, updated_at
  INTO v_admin;

  IF v_admin IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', v_admin.id,
    'email', v_admin.email,
    'display_name', v_admin.display_name,
    'role', v_admin.role,
    'avatar_url', v_admin.avatar_url,
    'created_at', v_admin.created_at,
    'updated_at', v_admin.updated_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.delete_admin_account(p_caller_id UUID, p_target_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_caller RECORD;
BEGIN
  IF p_caller_id = p_target_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  SELECT id, role INTO v_caller
  FROM public.dashboard_admins
  WHERE id = p_caller_id;

  IF v_caller IS NULL OR v_caller.role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.dashboard_admins WHERE id = p_target_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE public.dashboard_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read of admin list" ON public.dashboard_admins;
DROP POLICY IF EXISTS "Block direct inserts" ON public.dashboard_admins;
DROP POLICY IF EXISTS "Block direct updates" ON public.dashboard_admins;
DROP POLICY IF EXISTS "Block direct deletes" ON public.dashboard_admins;

CREATE POLICY "Allow read of admin list" ON public.dashboard_admins FOR SELECT USING (true);
CREATE POLICY "Block direct inserts" ON public.dashboard_admins FOR INSERT WITH CHECK (false);
CREATE POLICY "Block direct updates" ON public.dashboard_admins FOR UPDATE USING (false);
CREATE POLICY "Block direct deletes" ON public.dashboard_admins FOR DELETE USING (false);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.dashboard_admins_safe TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_account(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_profile(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_admin_account(UUID, UUID) TO authenticated;

INSERT INTO public.dashboard_admins (email, password_hash, display_name, role)
VALUES (
  'admin@pinnacle.com',
  crypt('PinnacleAdmin2024!', gen_salt('bf', 10)),
  'Super Admin',
  'super_admin'
) ON CONFLICT (email) DO NOTHING;

-- ── 2. Storage: admin avatars ───────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-avatars',
  'admin-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read admin avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar deletes" ON storage.objects;

CREATE POLICY "Public read admin avatars"
  ON storage.objects FOR SELECT USING (bucket_id = 'admin-avatars');
CREATE POLICY "Allow avatar uploads"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'admin-avatars');
CREATE POLICY "Allow avatar updates"
  ON storage.objects FOR UPDATE USING (bucket_id = 'admin-avatars');
CREATE POLICY "Allow avatar deletes"
  ON storage.objects FOR DELETE USING (bucket_id = 'admin-avatars');

-- ── 3. access_control_zones (Zone Editor + Heatmap + SOS) ──
CREATE TABLE IF NOT EXISTS public.access_control_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL DEFAULT 'Zone',
  type        TEXT NOT NULL DEFAULT 'other',
  zone_type   TEXT NOT NULL DEFAULT 'normal',
  x           DOUBLE PRECISION NOT NULL DEFAULT 0,
  y           DOUBLE PRECISION NOT NULL DEFAULT 0,
  w           DOUBLE PRECISION NOT NULL DEFAULT 100,
  h           DOUBLE PRECISION NOT NULL DEFAULT 100,
  is_blocked  BOOLEAN NOT NULL DEFAULT false,
  floor       TEXT NOT NULL DEFAULT 'ground'
);

CREATE INDEX IF NOT EXISTS idx_access_control_zones_floor ON public.access_control_zones (floor);

ALTER TABLE public.access_control_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acz_all_select" ON public.access_control_zones;
DROP POLICY IF EXISTS "acz_all_insert" ON public.access_control_zones;
DROP POLICY IF EXISTS "acz_all_update" ON public.access_control_zones;
DROP POLICY IF EXISTS "acz_all_delete" ON public.access_control_zones;

CREATE POLICY "acz_all_select" ON public.access_control_zones FOR SELECT USING (true);
CREATE POLICY "acz_all_insert" ON public.access_control_zones FOR INSERT WITH CHECK (true);
CREATE POLICY "acz_all_update" ON public.access_control_zones FOR UPDATE USING (true);
CREATE POLICY "acz_all_delete" ON public.access_control_zones FOR DELETE USING (true);

-- ── 4. emergency_state + toggle_emergency RPC ───────────────
CREATE TABLE IF NOT EXISTS public.emergency_state (
  id UUID PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  activated_by TEXT
);

ALTER TABLE public.emergency_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "es_select" ON public.emergency_state;
DROP POLICY IF EXISTS "es_update" ON public.emergency_state;
DROP POLICY IF EXISTS "es_insert" ON public.emergency_state;
CREATE POLICY "es_select" ON public.emergency_state FOR SELECT USING (true);
CREATE POLICY "es_update" ON public.emergency_state FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "es_insert" ON public.emergency_state FOR INSERT WITH CHECK (true);

INSERT INTO public.emergency_state (id, is_active, activated_at, activated_by)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.toggle_emergency(activate BOOLEAN, email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.emergency_state
  SET
    is_active = activate,
    activated_at = CASE WHEN activate THEN now() ELSE NULL END,
    activated_by = CASE WHEN activate THEN email ELSE NULL END
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_emergency(BOOLEAN, TEXT) TO anon, authenticated;

-- ── 5. emergency_stuck_reports + emergency_checkins ─────────
CREATE TABLE IF NOT EXISTS public.emergency_stuck_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  pos_x DOUBLE PRECISION,
  pos_y DOUBLE PRECISION,
  pos_z DOUBLE PRECISION,
  issue_description TEXT,
  status TEXT NOT NULL DEFAULT 'waiting_for_help',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.emergency_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  is_physically_able BOOLEAN NOT NULL DEFAULT true,
  is_in_safe_place BOOLEAN NOT NULL DEFAULT false,
  pos_x DOUBLE PRECISION,
  pos_y DOUBLE PRECISION,
  pos_z DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_emergency_stuck_reports_u ON public.emergency_stuck_reports;
CREATE TRIGGER tr_emergency_stuck_reports_u
  BEFORE UPDATE ON public.emergency_stuck_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS tr_emergency_checkins_u ON public.emergency_checkins;
CREATE TRIGGER tr_emergency_checkins_u
  BEFORE UPDATE ON public.emergency_checkins
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.emergency_stuck_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stuck_all" ON public.emergency_stuck_reports;
DROP POLICY IF EXISTS "checkin_all" ON public.emergency_checkins;
CREATE POLICY "stuck_all" ON public.emergency_stuck_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "checkin_all" ON public.emergency_checkins FOR ALL USING (true) WITH CHECK (true);

-- ── 6. emergency_responses ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.emergency_responses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_id         UUID NOT NULL,
  user_email           TEXT NOT NULL,
  user_name            TEXT NOT NULL,
  acknowledged         BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at      TIMESTAMPTZ,
  ability_status       TEXT CHECK (ability_status IN (
                         'physically_abled','pregnant','children','not_able_to_walk')),
  choice               TEXT CHECK (choice IN ('exit','save_someone') OR choice IS NULL),
  rescue_target_name   TEXT,
  rescue_target_status TEXT,
  navigation_status    TEXT NOT NULL DEFAULT 'pending' CHECK (navigation_status IN (
                         'pending','navigating_to_exit','navigating_to_rescue',
                         'waiting_for_help','reached_exit','reached_person','rescued')),
  pos_x                DOUBLE PRECISION DEFAULT 0,
  pos_y                DOUBLE PRECISION DEFAULT 0,
  pos_z                DOUBLE PRECISION DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_responses_emergency_id ON public.emergency_responses (emergency_id);

DROP TRIGGER IF EXISTS emergency_responses_updated_at ON public.emergency_responses;
CREATE TRIGGER emergency_responses_updated_at
  BEFORE UPDATE ON public.emergency_responses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.emergency_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "er_select" ON public.emergency_responses;
DROP POLICY IF EXISTS "er_insert" ON public.emergency_responses;
DROP POLICY IF EXISTS "er_update" ON public.emergency_responses;
DROP POLICY IF EXISTS "er_delete" ON public.emergency_responses;
CREATE POLICY "er_select" ON public.emergency_responses FOR SELECT USING (true);
CREATE POLICY "er_insert" ON public.emergency_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "er_update" ON public.emergency_responses FOR UPDATE USING (true);
CREATE POLICY "er_delete" ON public.emergency_responses FOR DELETE USING (true);

-- ── 7. ar_rooms (Block Shops) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ar_rooms (
  room_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name  TEXT NOT NULL,
  floor_no   TEXT,
  is_active  CHARACTER(1) NOT NULL DEFAULT 'Y',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ar_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ar_rooms_all" ON public.ar_rooms;
CREATE POLICY "ar_rooms_all" ON public.ar_rooms FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.ar_rooms (room_name, floor_no, is_active)
SELECT v.room_name, v.floor_no, v.ia
FROM (VALUES
  ('Main Lobby', 'Ground Floor', 'Y'::bpchar),
  ('Conference Room A', 'Ground Floor', 'Y'::bpchar),
  ('Cafeteria', 'Ground Floor', 'Y'::bpchar)
) AS v(room_name, floor_no, ia)
WHERE NOT EXISTS (SELECT 1 FROM public.ar_rooms LIMIT 1);

-- ── 8. AR Ropin tables (Access Control + admin tables) ──────
CREATE TABLE IF NOT EXISTS public.ar_ropin_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  name_display TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ar_ropin_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_name TEXT,
  name_display TEXT,
  floor_level INTEGER DEFAULT 0,
  building_id UUID,
  status TEXT DEFAULT 'OPEN',
  weight_factor NUMERIC DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ar_ropin_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name TEXT,
  name_display TEXT,
  floor_id UUID,
  status TEXT DEFAULT 'OPEN',
  weight_factor NUMERIC DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ar_ropin_pois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_name TEXT,
  poi_type TEXT,
  icon_url TEXT,
  pos_x DOUBLE PRECISION DEFAULT 0,
  pos_y DOUBLE PRECISION DEFAULT 0,
  pos_z DOUBLE PRECISION DEFAULT 0,
  show_in_ar BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ar_ropin_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_name TEXT,
  name_display TEXT,
  entry_type TEXT,
  building_id UUID,
  floor_id UUID,
  pos_x DOUBLE PRECISION DEFAULT 0,
  pos_y DOUBLE PRECISION DEFAULT 0,
  pos_z DOUBLE PRECISION DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ar_ropin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'USER',
  share_enabled TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ar_ropin_navnode (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.ar_ropin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ar_ropin_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_ropin_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_ropin_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_ropin_pois ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_ropin_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_ropin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_ropin_navnode ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ropin_buildings_all" ON public.ar_ropin_buildings;
DROP POLICY IF EXISTS "ropin_floors_all" ON public.ar_ropin_floors;
DROP POLICY IF EXISTS "ropin_zones_all" ON public.ar_ropin_zones;
DROP POLICY IF EXISTS "ropin_pois_all" ON public.ar_ropin_pois;
DROP POLICY IF EXISTS "ropin_entries_all" ON public.ar_ropin_entries;
DROP POLICY IF EXISTS "ropin_users_all" ON public.ar_ropin_users;
DROP POLICY IF EXISTS "ropin_navnode_all" ON public.ar_ropin_navnode;

CREATE POLICY "ropin_buildings_all" ON public.ar_ropin_buildings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ropin_floors_all" ON public.ar_ropin_floors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ropin_zones_all" ON public.ar_ropin_zones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ropin_pois_all" ON public.ar_ropin_pois FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ropin_entries_all" ON public.ar_ropin_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ropin_users_all" ON public.ar_ropin_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "ropin_navnode_all" ON public.ar_ropin_navnode FOR ALL USING (true) WITH CHECK (true);

-- Sample AR rows (only if tables empty)
INSERT INTO public.ar_ropin_buildings (name, name_display, description, is_active)
SELECT 'Main Venue', 'Main Building', 'Primary structure', true
WHERE NOT EXISTS (SELECT 1 FROM public.ar_ropin_buildings LIMIT 1);

INSERT INTO public.ar_ropin_floors (floor_name, name_display, floor_level, building_id, is_active)
SELECT 'Ground', 'Ground Floor', 0, b.id, true
FROM public.ar_ropin_buildings b
WHERE NOT EXISTS (SELECT 1 FROM public.ar_ropin_floors LIMIT 1)
LIMIT 1;

INSERT INTO public.ar_ropin_zones (zone_name, name_display, floor_id, is_active)
SELECT 'Lobby', 'Main Lobby', f.id, true
FROM public.ar_ropin_floors f
WHERE NOT EXISTS (SELECT 1 FROM public.ar_ropin_zones LIMIT 1)
LIMIT 1;

INSERT INTO public.ar_ropin_entries (entry_name, name_display, entry_type, building_id, floor_id, is_active)
SELECT 'Main Gate', 'Main Entrance', 'gate', b.id, f.id, true
FROM public.ar_ropin_buildings b
CROSS JOIN public.ar_ropin_floors f
WHERE NOT EXISTS (SELECT 1 FROM public.ar_ropin_entries LIMIT 1)
LIMIT 1;

-- ============================================================
-- Optional: seed emergency_responses (uncomment to run)
-- ============================================================
/*
INSERT INTO public.emergency_responses
  (emergency_id, user_email, user_name, acknowledged, acknowledged_at,
   ability_status, choice, rescue_target_name, rescue_target_status,
   navigation_status, pos_x, pos_y, pos_z)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'demo@example.com', 'Demo User',
   true, now(), 'physically_abled', 'exit', NULL, NULL,
   'navigating_to_exit', 38.5, 213, -62.3);
*/
