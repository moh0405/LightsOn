import { useEffect, useMemo, useRef } from "react";
import { MercatorCoordinate, type Map as CityMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

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

/** The selection outline only: floors, window bands and their glow stay depth-tested in MapLibre. */
export function SkylineAccents({ map, floors, selections }: { map: CityMap; floors: FeatureCollection; selections: Selection[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const geometry = useMemo(() => floors.features.map(f => {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    const base = Number(f.properties?.base_m), top = Number(f.properties?.height_m);
    const vertex = (p: number[], z: number): Vertex => {
      const m = MercatorCoordinate.fromLngLat([p[0]!, p[1]!], z); return [m.x, m.y, m.z];
    };
    return { id: String(f.properties?.building_id),
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
  }, [map, geometry, selections]);
  return <canvas ref={canvas} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}
