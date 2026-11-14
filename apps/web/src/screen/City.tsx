import { useCallback, useEffect, useRef, useState } from "react";
import { Map as CityMap, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
setWorkerUrl(workerUrl);
import type { FeatureCollection } from "geojson";
import { floorColorExpression } from "../lib/floor-colors";
import { getData, prefetchDossiers, type Building } from "../lib/buildings";
import { useGame } from "../lib/store";
import { HoverCard } from "./overlays/HoverCard";

declare global { interface Window { __lightsOnMap?: CityMap } }
const CENTER: [number, number] = [-95.3650891, 29.7588018];
const FLOOR_COLOR = floorColorExpression({});
interface Hover { player: string; building: string; color: string }

export function City() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<CityMap | null>(null);
  const { pointers, players, phase, buildingId, revivedColors, revival, dataMode, hasState } = useGame();
  const current = useRef({ pointers, phase });
  current.current = { pointers, phase };
  const [ready, setReady] = useState(false);
  const [flashPoint, setFlashPoint] = useState<{ x: number; y: number } | null>(null);
  const [factsReady, setFactsReady] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [hovers, setHovers] = useState<Hover[]>([]);
  const [error, setError] = useState<string | null>(null);
  const factError = useCallback(() => setError("Building facts are unavailable. You can still aim and wake a building."), []);

  useEffect(() => {
    if (!hasState) return;
    let active = true;
    setFactsReady(false);
    setBuildings([]);
    void getData<Building[]>("/api/buildings").then(async (b) => {
      if (!active) return;
      setBuildings(b);
      await prefetchDossiers(b);
      if (active) setFactsReady(true);
    }).catch(() => { if (active) factError(); });
    return () => { active = false; };
  }, [dataMode, hasState, factError]);

  useEffect(() => {
    let active = true;
    let map: CityMap;
    try {
      map = new CityMap({ container: container.current!, center: CENTER, zoom: 15.5, pitch: 60,
        attributionControl: false, interactive: false,
        style: { version: 8, sources: {}, layers: [{ id: "night", type: "background", paint: { "background-color": "#10131c" } }] },
      });
    } catch { setError("Skyline unavailable. Use the Wake buttons on your phone."); return; }
    mapRef.current = map;
    if (import.meta.env.DEV || import.meta.env.MODE === "test") window.__lightsOnMap = map;
    map.on("error", () => { if (active) setError("Some skyline data is unavailable. Use the Wake buttons on your phone."); });
    map.on("load", () => {
      void Promise.allSettled([
        getData<FeatureCollection>("/city.geojson"), getData<FeatureCollection>("/floors.geojson"),
      ]).then(([city, floors]) => {
        if (!active) return;
        if (city.status === "fulfilled") {
          map.addSource("city", { type: "geojson", data: city.value });
          map.addLayer({ id: "context", type: "fill-extrusion", source: "city", paint: { "fill-extrusion-color": "#252e40", "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-opacity": 0.65 } });
        }
        if (floors.status === "fulfilled") {
          map.addSource("floors", { type: "geojson", data: floors.value });
          map.addLayer({ id: "floors", type: "fill-extrusion", source: "floors", paint: {
            "fill-extrusion-base": ["get", "base_m"], "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-color": FLOOR_COLOR,
          } });
        }
        if (city.status === "rejected" || floors.status === "rejected") setError("Skyline data is unavailable. Use the Wake buttons on your phone.");
        setReady(true);
      });
    });
    let last = performance.now();
    const orbit = setInterval(() => {
      const now = performance.now();
      if (["EXPLORE", "LOBBY"].includes(current.current.phase) && !map.isMoving()) map.jumpTo({ bearing: map.getBearing() + (now - last) * 0.0015 });
      last = now;
    }, 100);
    return () => {
      active = false; clearInterval(orbit); mapRef.current = null;
      if (window.__lightsOnMap === map) delete window.__lightsOnMap;
      map.remove();
    };
  }, [factError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (buildingId) {
      const building = buildings.find((b) => String(b.id) === buildingId);
      if (building?.lng != null && building.lat != null) map.flyTo({ center: [building.lng, building.lat], zoom: 17.5, pitch: 60, duration: 2500, essential: true });
    } else if (phase === "EXPLORE" || phase === "LOBBY") {
      map.flyTo({ center: CENTER, zoom: 15.5, pitch: 60, duration: 2500, essential: true });
    }
  }, [buildingId, buildings, ready, phase === "EXPLORE" || phase === "LOBBY"]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("floors")) return;
    const outlined = new Map<string, string>();
    const update = () => {
      const next: Hover[] = [];
      for (const [player, p] of Object.entries(current.current.pointers)) {
        const feature = map.queryRenderedFeatures([p.x * map.getCanvas().clientWidth, p.y * map.getCanvas().clientHeight], { layers: ["floors"] })[0];
        const building = feature?.properties?.building_id as string | undefined;
        const layer = `hover-${player}`;
        if (!map.getLayer(layer)) map.addLayer({ id: layer, type: "line", source: "floors", filter: ["==", ["get", "building_id"], ""], paint: { "line-color": p.color, "line-width": 3, "line-offset": -3 } });
        if (outlined.get(layer) !== (building ?? "")) {
          map.setFilter(layer, ["==", ["get", "building_id"], building ?? ""]);
          outlined.set(layer, building ?? "");
        }
        if (building) next.push({ player, building: String(building), color: p.color });
      }
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.id.startsWith("hover-") && !current.current.pointers[layer.id.slice(6)]) map.removeLayer(layer.id);
      }
      setHovers((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update(); map.on("render", update);
    return () => { map.off("render", update); };
  }, [ready, pointers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("floors")) return;
    const target = buildings.find((b) => String(b.id) === revival?.building_id);
    setFlashPoint(target?.lng != null && target.lat != null ? map.project([target.lng, target.lat]) : null);
    map.setPaintProperty("floors", "fill-extrusion-color-transition", { duration: 0 });
    let frame = 0;
    const paint = () => {
      map.setPaintProperty("floors", "fill-extrusion-color", floorColorExpression(revivedColors, revival ?? undefined));
      if (revival && Date.now() - revival.at < 600 + Math.max(0, revival.floors.length - 1) * 60) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [revivedColors, revival, ready, buildings]);

  return <>
    {error && <div role="alert" style={{ padding: 10, background: "#5a3b00" }}>{error}</div>}
    <div data-testid="field" data-facts-ready={ready && factsReady} style={{ position: "relative", height: "65vh", minHeight: 360, borderRadius: 12, overflow: "hidden", background: "#10131c" }}>
      {revival && flashPoint && <div key={revival.at} aria-hidden="true" style={{ position: "absolute", top: flashPoint.y, left: flashPoint.x - 32, width: 64, height: 24, zIndex: 1, background: "white", filter: "blur(18px)", animation: "city-flash 200ms forwards", pointerEvents: "none" }} />}
      <style>{`@keyframes city-flash { from { opacity: 0.9 } to { opacity: 0 } }`}</style>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      {Object.entries(pointers).map(([id, p]) => <div key={id} data-testid="dot" style={{ pointerEvents: "none", position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: "50%", background: p.color, boxShadow: `0 0 16px 6px ${p.color}`, transition: "left 60ms linear, top 60ms linear" }}>
        <span style={{ position: "absolute", top: 26, fontSize: 12 }}>{players[id]?.nickname}</span>
      </div>)}
      <div style={{ position: "absolute", left: 16, top: 16, display: "grid", gap: 8, pointerEvents: "none" }}>
        {hovers.map((h) => <HoverCard key={`${dataMode}-${h.player}-${h.building}`} id={h.building} color={h.color} onError={factError} />)}
      </div>
    </div>
  </>;
}
