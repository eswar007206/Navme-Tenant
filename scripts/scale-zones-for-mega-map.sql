-- Run ONCE after switching to mega maps (2.5× pixel + building scale).
-- Moves existing zone rectangles from old 1584×2241 space into new 3960×5603 space.

UPDATE public.access_control_zones
SET
  x = ROUND(x::numeric * 2.5),
  y = ROUND(y::numeric * 2.5),
  w = ROUND(w::numeric * 2.5),
  h = ROUND(h::numeric * 2.5);
