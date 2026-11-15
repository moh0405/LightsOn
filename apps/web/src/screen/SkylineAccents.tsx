import { useEffect, useMemo, useRef } from "react";
import { MercatorCoordinate, type Map as CityMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { resolveFloorColor, type RevivedColors } from "../lib/floor-colors";
import type { Status } from "../lib/buildings";
import { firstFloorAt } from "./effects";

type Point = [number, number];
type Vertex = [number, number, number];
interface Selection { building: string; color: string }

function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (values: Point[]) => {
    const result: Point[] = [];
    for (const p of values) {
      while (result.length >= 2 && cross(result[result.length - 2]!, result[result.length - 1]!, p) <= 0) result.pop();
      result.push(p);
    }
    result.pop(); return result;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/** Cosmetic light only: the authoritative, depth-tested floors stay in MapLibre. */
export function SkylineAccents({ map, floors, selections, colors, revival }: {
  map: CityMap; floors: FeatureCollection; selections: Selection[]; colors: RevivedColors;
  revival: { building_id: string; floors: number[]; at: number } | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const geometry = useMemo(() => floors.features.map(f => {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    const base = Number(f.properties?.base_m), top = Number(f.properties?.height_m);
    const vertex = (p: number[], z: number): Vertex => {
      const m = MercatorCoordinate.fromLngLat([p[0]!, p[1]!], z); return [m.x, m.y, m.z];
    };
    return { id: String(f.properties?.building_id), floor: Number(f.properties?.floor_number), status: f.properties?.source_status as Status,
      game: f.properties?.game_status as string | null,
      edges: polygons.map(p => (p[0] ?? []).map(v => vertex(v, (base + top) / 2))),
      volume: polygons.flatMap(p => (p[0] ?? []).flatMap(v => [vertex(v, base), vertex(v, top)])),
    };
  }), [floors]);
  useEffect(() => {
    const element = canvas.current!, ctx = element.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const { clientWidth: w, clientHeight: h } = map.getCanvas();
      if (element.width !== w || element.height !== h) { element.width = w; element.height = h; }
      ctx.clearRect(0, 0, w, h);
      // Use the same projection matrix as the 3D framing checks, including elevation.
      const matrix = map._camera.transform.getProjectionDataForCustomLayer(false).mainMatrix;
      const project = ([x, y, z]: Vertex): Point => {
        const cx = x * matrix[0]! + y * matrix[4]! + z * matrix[8]! + matrix[12]!;
        const cy = x * matrix[1]! + y * matrix[5]! + z * matrix[9]! + matrix[13]!;
        const cw = x * matrix[3]! + y * matrix[7]! + z * matrix[11]! + matrix[15]!;
        return [(cx / cw + 1) * w / 2, (1 - cy / cw) * h / 2];
      };
      const path = (points: Point[]) => {
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
      };
      // Batch lit floors by colour and fake the glow with a wide faint stroke:
      // canvas shadowBlur per floor cost ~5 ms a frame on the attract orbit.
      const lit = new Map<string, Point[][]>();
      for (const floor of geometry) {
        const revived = colors[floor.id]?.floors.includes(floor.floor);
        if (floor.status !== "occupied" && !revived) continue;
        const order = revival?.building_id === floor.id ? [...revival.floors].sort((a, b) => a - b).indexOf(floor.floor) : -1;
        const progress = order >= 0 && revival ? Math.max(0, Math.min(1, (Date.now() - firstFloorAt(revival.at) - order * 60) / 600)) : 1;
        if (progress <= 0) continue;
        const key = `${resolveFloorColor(floor.status, floor.game, floor.id, floor.floor, colors)}|${Math.round(progress * 10)}`;
        const list = lit.get(key) ?? []; lit.set(key, list);
        for (const edge of floor.edges) list.push(edge.map(project));
      }
      for (const [key, edges] of lit) {
        const [color, step] = key.split("|");
        ctx.beginPath();
        for (const points of edges) { points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); }
        ctx.strokeStyle = color!; const progress = Number(step) / 10;
        ctx.lineWidth = 5; ctx.globalAlpha = 0.04 * progress; ctx.stroke();
        ctx.lineWidth = 1; ctx.globalAlpha = 0.12 * progress; ctx.stroke();
      }
      for (const selection of selections) {
        const points = hull(geometry.filter(f => f.id === selection.building).flatMap(f => f.volume.map(project)));
        if (points.length < 3) continue;
        path(points.map(([x, y]) => [x, y - 3]));
        ctx.strokeStyle = selection.color; ctx.shadowColor = selection.color; ctx.shadowBlur = 12;
        ctx.lineWidth = 2; ctx.globalAlpha = 0.9; ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    };
    draw(); map.on("render", draw);
    return () => { map.off("render", draw); };
  }, [map, geometry, selections, colors, revival]);
  return <canvas ref={canvas} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}
