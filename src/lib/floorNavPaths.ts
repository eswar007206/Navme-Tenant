/** Parse JSONB / API `points` into {x,y}[] — handles stringified JSON from some clients */

import { supabase } from "@/lib/supabase";

export interface FloorNavPoint {
  x: number;
  y: number;
}

export function parseFloorNavPoints(raw: unknown): FloorNavPoint[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => {
      if (p && typeof p === "object" && "x" in p && "y" in p) {
        const x = Number((p as { x: number }).x);
        const y = Number((p as { y: number }).y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      }
      return null;
    })
    .filter((p): p is FloorNavPoint => p !== null);
}

export type NavPathRow = { floor: string; points: FloorNavPoint[] };

/** Stable two-row shape for React Query + upsert */
export function normalizeNavRowsFromSelect(
  rows: { floor: string; points: unknown }[] | null | undefined,
): NavPathRow[] {
  const list = rows ?? [];
  return [
    { floor: "ground", points: parseFloorNavPoints(list.find((r) => r.floor === "ground")?.points) },
    { floor: "first", points: parseFloorNavPoints(list.find((r) => r.floor === "first")?.points) },
  ];
}

/** Shared fetch for Access Control + Heatmap (always 2 floors) */
export async function fetchFloorNavPathsRows(): Promise<NavPathRow[]> {
  const { data, error } = await supabase.from("floor_nav_paths").select("floor, points");
  if (error) {
    console.warn("[floor_nav_paths] read failed:", error.message);
    return normalizeNavRowsFromSelect([]);
  }
  return normalizeNavRowsFromSelect(data as { floor: string; points: unknown }[]);
}
