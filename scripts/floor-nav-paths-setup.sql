-- ═══════════════════════════════════════════════════════════════════════════
-- Run this ENTIRE script in Supabase → SQL Editor (as postgres / service role).
-- Fixes: table missing, RLS blocking anon key, or missing GRANTs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.floor_nav_paths (
  floor TEXT PRIMARY KEY CHECK (floor IN ('ground', 'first')),
  points JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.floor_nav_paths ENABLE ROW LEVEL SECURITY;

-- Allow browser (anon) + logged-in users to read/write paths
DROP POLICY IF EXISTS "floor_nav_paths_select" ON public.floor_nav_paths;
DROP POLICY IF EXISTS "floor_nav_paths_insert" ON public.floor_nav_paths;
DROP POLICY IF EXISTS "floor_nav_paths_update" ON public.floor_nav_paths;
DROP POLICY IF EXISTS "floor_nav_paths_delete" ON public.floor_nav_paths;
DROP POLICY IF EXISTS "floor_nav_paths_all" ON public.floor_nav_paths;

CREATE POLICY "floor_nav_paths_select"
  ON public.floor_nav_paths FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "floor_nav_paths_insert"
  ON public.floor_nav_paths FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "floor_nav_paths_update"
  ON public.floor_nav_paths FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "floor_nav_paths_delete"
  ON public.floor_nav_paths FOR DELETE TO anon, authenticated
  USING (true);

-- API access: required for Supabase client with anon key
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.floor_nav_paths TO anon, authenticated;

-- Optional seed (no ON CONFLICT — works even if PK was missing before)
INSERT INTO public.floor_nav_paths (floor, points)
SELECT v.floor, v.points::jsonb
FROM (VALUES ('ground', '[]'), ('first', '[]')) AS v(floor, points)
WHERE NOT EXISTS (SELECT 1 FROM public.floor_nav_paths f WHERE f.floor = v.floor);
