import { GENERATED_FLOOR_PLAN_PIXELS } from "./floorPlanDimensions.generated";

export type FloorPlanFloorKey = "ground" | "first";

/** Fallback — shared office plan (ground + first use same asset) */
const FALLBACK: Record<FloorPlanFloorKey, { w: number; h: number }> = {
  ground: { w: 1024, h: 682 },
  first: { w: 1024, h: 682 },
};

export function getFloorPlanPixels(floor: FloorPlanFloorKey): { w: number; h: number } {
  const d = GENERATED_FLOOR_PLAN_PIXELS[floor];
  if (d?.w > 0 && d?.h > 0) return { w: d.w, h: d.h };
  return FALLBACK[floor];
}

/** Same 30k sq ft plan for both floors (replace file in public/maps to update). */
export const FLOOR_MAP_PNG: Record<FloorPlanFloorKey, string> = {
  ground: "/maps/office-floor-plan.jpg",
  first: "/maps/office-floor-plan.jpg",
};
