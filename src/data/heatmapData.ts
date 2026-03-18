export const FLOOR_Y_THRESHOLD = 3;
export const PROXIMITY_THRESHOLD = 2.0;

export const ROOM_COLORS = [
  "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  "#14B8A6", "#E11D48", "#9333EA",
];

export function getHeatColor(intensity: number): string {
  if (intensity >= 0.8) return "#EF4444";
  if (intensity >= 0.6) return "#F97316";
  if (intensity >= 0.4) return "#EAB308";
  if (intensity >= 0.2) return "#22D3EE";
  return "#3B82F6";
}

export function getHeatLabel(intensity: number): string {
  if (intensity >= 0.8) return "Peak";
  if (intensity >= 0.6) return "Very High";
  if (intensity >= 0.4) return "High";
  if (intensity >= 0.2) return "Moderate";
  return "Low";
}

export function distance2D(x1: number, z1: number, x2: number, z2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
}

export function getFloor(posY: number): "ground" | "first" {
  return posY < FLOOR_Y_THRESHOLD ? "ground" : "first";
}

export interface BuildingOutlinePoint {
  label: string;
  x: number;
  z: number;
}

const S = 2.5;
export const BUILDING_OUTLINE: BuildingOutlinePoint[] = [
  { label: "p1", x: 9.33 * S, z: -11.0 * S },
  { label: "p2", x: 9.41 * S, z: -6.4 * S },
  { label: "p3", x: 9.41 * S, z: -0.7 * S },
  { label: "p4", x: 9.41 * S, z: 4.52 * S },
  { label: "p5", x: 5.56 * S, z: 4.48 * S },
  { label: "p6", x: 1.67 * S, z: 4.48 * S },
  { label: "p7", x: -2.5 * S, z: 4.48 * S },
  { label: "p8", x: -2.48 * S, z: -0.69 * S },
  { label: "p9", x: -2.41 * S, z: -4.75 * S },
  { label: "p10", x: -1.12 * S, z: -11.0 * S },
  { label: "p11", x: -4.19 * S, z: -11.0 * S },
];

export const BUILDING_BOUNDS = {
  zMin: -13 * S,
  zMax: 6.5 * S,
  xMin: -6 * S,
  xMax: 11 * S,
};

/** Tight bbox inside outline for spawning dummy people / sampling. */
export function getBuildingOutlineBoundingBox(pad = 0.8) {
  let xMin = Infinity,
    xMax = -Infinity,
    zMin = Infinity,
    zMax = -Infinity;
  for (const p of BUILDING_OUTLINE) {
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }
  return {
    xMin: xMin + pad,
    xMax: xMax - pad,
    zMin: zMin + pad,
    zMax: zMax - pad,
  };
}

export function generateTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}
