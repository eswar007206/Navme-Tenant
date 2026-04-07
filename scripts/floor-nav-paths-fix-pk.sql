-- If app upserts still fail: ensure `floor` is the primary key (required for ON CONFLICT / Supabase upsert).

-- 1) Remove duplicate rows if any (keep one row per floor)
DELETE FROM public.floor_nav_paths
WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM public.floor_nav_paths GROUP BY floor
);

-- 2) Add primary key if missing (ignore error if it already exists)
ALTER TABLE public.floor_nav_paths ADD PRIMARY KEY (floor);
