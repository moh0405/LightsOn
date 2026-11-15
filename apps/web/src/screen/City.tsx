import { useShallow } from "zustand/react/shallow";
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
import { Sparks } from "./Sparks";
import { FLASH_MS, firstFloorAt, INTRO_DIVE_MS, lightUpDuration } from "./effects";
import { fadedOccluders, frameCamera, frameVolume, occluders, planCamera, ROUND_PITCH } from "./camera";

declare global { interface Window { __lightsOnMap?: CityMap; __lightsOnFrameBuilding?: (id: string) => void } }
const CENTER: [number, number] = [-95.3650891, 29.7588018];
const FLOOR_COLOR = floorColorExpression({});
interface Hover { player: string; building: string; color: string }

export function City({ onHover }: { onHover?: (id: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<CityMap | null>(null);
  const { phase, buildingId, revivedColors, revival, dataMode, hasState } = useGame(useShallow(s => ({ phase: s.phase, buildingId: s.buildingId, revivedColors: s.revivedColors, revival: s.revival, dataMode: s.dataMode, hasState: s.hasState })));
  const current = useRef({ phase });
  current.current = { phase };
  const [ready, setReady] = useState(false);
  const [flashPoint, setFlashPoint] = useState<{ x: number; y: number } | null>(null);
  const [factsReady, setFactsReady] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [hovers, setHovers] = useState<Hover[]>([]);
  const [error, setError] = useState<string | null>(null);
  const geo = useRef<{ city?: FeatureCollection; floors?: FeatureCollection }>({});
  const reframe = useRef<(duration?: number) => void>(() => {});
  const testFrame = useRef(false);
  const overview = useRef<ReturnType<typeof frameVolume>>(null);
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
        attributionControl: false, interactive: false, fadeDuration: 0,
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
          city.value.features.forEach((f, i) => { f.properties = { ...f.properties, _i: i }; });
          geo.current.city = city.value;
          map.addSource("city", { type: "geojson", data: city.value });
          map.addLayer({ id: "context", type: "fill-extrusion", source: "city", paint: { "fill-extrusion-color": "#252e40", "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-opacity": 0.65 } });
        }
        if (floors.status === "fulfilled") {
          geo.current.floors = floors.value;
          map.addSource("floors", { type: "geojson", data: floors.value });
          map.addLayer({ id: "floors", type: "fill-extrusion", source: "floors", paint: {
            "fill-extrusion-base": ["get", "base_m"], "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-color": FLOOR_COLOR,
          } });
          map.addLayer({ id: "floors-faded", type: "fill-extrusion", source: "floors", filter: ["in", ["get", "building_id"], ["literal", []]], paint: {
            "fill-extrusion-base": ["get", "base_m"], "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-color": FLOOR_COLOR, "fill-extrusion-opacity": 0.12,
          } });
        }
        // Context towers between the round camera and the hero are drawn after the floors as glass,
        // so the light-up stays visible (filters are set per hero below).
        if (city.status === "fulfilled") map.addLayer({ id: "context-faded", type: "fill-extrusion", source: "city", filter: ["in", ["get", "_i"], ["literal", []]], paint: { "fill-extrusion-color": "#3a4560", "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-opacity": 0.12 } });
        if (city.status === "rejected" || floors.status === "rejected") setError("Skyline data is unavailable. Use the Wake buttons on your phone.");
        overview.current = frameVolume([geo.current.city, geo.current.floors].filter((g): g is FeatureCollection => !!g));
        setReady(true);
      });
    });
    const resize = new ResizeObserver(() => { map.resize(); reframe.current(0); });
    resize.observe(container.current!);
    let last = performance.now();
    const orbit = setInterval(() => {
      const now = performance.now();
      if (["EXPLORE", "LOBBY"].includes(current.current.phase) && !testFrame.current && !map.isMoving() && overview.current) {
        const canvas = map.getCanvas();
        map.jumpTo(frameCamera(overview.current, canvas.clientWidth, canvas.clientHeight, map.getBearing() + (now - last) * 0.0015, ROUND_PITCH, map.getVerticalFieldOfView()));
      }
      last = now;
    }, 100);
    return () => {
      active = false; resize.disconnect(); clearInterval(orbit); mapRef.current = null;
      if (window.__lightsOnMap === map) delete window.__lightsOnMap;
      map.remove();
    };
  }, [factError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const fade = (indexes: number[], floorIds: string[] = []) => {
      if (!map.getLayer("context") || !map.getLayer("context-faded")) return;
      map.setFilter("context", indexes.length ? ["!", ["in", ["get", "_i"], ["literal", indexes]]] : null);
      map.setFilter("context-faded", ["in", ["get", "_i"], ["literal", indexes]]);
      if (map.getLayer("floors-faded")) {
        map.setFilter("floors", floorIds.length ? ["!", ["in", ["get", "building_id"], ["literal", floorIds]]] : null);
        map.setFilter("floors-faded", ["in", ["get", "building_id"], ["literal", floorIds]]);
      }
    };
    const dive = (id: string, duration = INTRO_DIVE_MS, settle = false) => {
      const { city, floors } = geo.current;
      const volume = floors ? frameVolume([floors], id) : null;
      if (!volume) return;
      // Protect the base as well as the lowest available floor. Keep the open-side bearing.
      const plan = city ? planCamera(occluders(city, ...volume.center), 0, ROUND_PITCH, volume.radius) : { bearing: 0, faded: [] };
      // Wakeable neighbors also have floor geometry, independent of the city layer.
      // Fade both representations without changing the open-side bearing.
      const floorIds = floors ? [...new Set(fadedOccluders(occluders(floors, ...volume.center), plan.bearing, 0, ROUND_PITCH, volume.radius)
        .map(index => String(floors.features[index]?.properties?.building_id)).filter(other => other !== id))] : [];
      fade(plan.faded, floorIds);
      const canvas = map.getCanvas();
      const camera = frameCamera(volume, canvas.clientWidth, canvas.clientHeight, plan.bearing, ROUND_PITCH, map.getVerticalFieldOfView(), Math.min(220, canvas.clientHeight * 0.34));
      if (settle) map.easeTo({ ...camera, zoom: camera.zoom - 0.15, duration, essential: true });
      else map.flyTo({ ...camera, duration, essential: true });
    };
    const update = (duration = INTRO_DIVE_MS) => {
      if (buildingId) dive(buildingId, duration);
      else if ((phase === "EXPLORE" || phase === "LOBBY") && overview.current) {
        fade([]);
        const canvas = map.getCanvas();
        map.flyTo({ ...frameCamera(overview.current, canvas.clientWidth, canvas.clientHeight, map.getBearing(), ROUND_PITCH, map.getVerticalFieldOfView()), duration, essential: true });
      }
    };
    testFrame.current = false;
    reframe.current = update;
    if (import.meta.env.DEV || import.meta.env.MODE === "test") window.__lightsOnFrameBuilding = id => { testFrame.current = true; dive(id); };
    update();
    const timer = revival ? setTimeout(() => dive(revival.building_id, 1800, true), Math.max(0, revival.at + lightUpDuration(revival.floors) - Date.now())) : undefined;
    return () => { clearTimeout(timer); reframe.current = () => {}; delete window.__lightsOnFrameBuilding; };
  }, [buildingId, ready, phase === "EXPLORE" || phase === "LOBBY", revival]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("floors")) return;
    const outlined = new Map<string, string>();
    const layers = new Set<string>();
    const update = () => {
      const pointers = useGame.getState().pointers;
      if (!Object.keys(pointers).length && !layers.size) return;
      const next: Hover[] = [];
      for (const [player, p] of Object.entries(pointers)) {
        // The visible beam is 22 px wide. A small hit area keeps its edge
        // responsive while the attract camera orbits and touch rounds pixels.
        const x = p.x * map.getCanvas().clientWidth, y = p.y * map.getCanvas().clientHeight;
        const feature = map.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]], { layers: ["floors"] })[0];
        const building = feature?.properties?.building_id as string | undefined;
        const layer = `hover-${player}`;
        if (!map.getLayer(layer)) map.addLayer({ id: layer, type: "line", source: "floors", filter: ["==", ["get", "building_id"], ""], paint: { "line-color": p.color, "line-width": 3, "line-offset": -3 } });
        layers.add(layer);
        if (outlined.get(layer) !== (building ?? "")) {
          map.setFilter(layer, ["==", ["get", "building_id"], building ?? ""]);
          outlined.set(layer, building ?? "");
        }
        if (building) next.push({ player, building: String(building), color: p.color });
      }
      for (const layer of layers) {
        if (!pointers[layer.slice(6)]) { map.removeLayer(layer); layers.delete(layer); outlined.delete(layer); }
      }
      setHovers((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update(); map.on("render", update);
    // A pointer schedules a map frame without remounting this effect, rebuilding
    // filters, or rerendering every projector overlay.
    const unsubscribe = useGame.subscribe((s, p) => { if (s.pointers !== p.pointers) map.triggerRepaint(); });
    return () => { unsubscribe(); map.off("render", update); };
  }, [ready]);

  useEffect(() => { onHover?.(hovers[0]?.building ?? null); }, [hovers, onHover]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("floors")) return;
    map.setPaintProperty("floors", "fill-extrusion-color-transition", { duration: 0 });
    map.setPaintProperty("floors-faded", "fill-extrusion-color-transition", { duration: 0 });
    let frame = 0;
    const paint = () => {
      // Paint and scheduling must share one clock read so the final frame
      // cannot be dropped when the deadline is crossed during setPaintProperty.
      const now = Date.now();
      map.setPaintProperty("floors", "fill-extrusion-color", floorColorExpression(revivedColors, revival ? { ...revival, at: firstFloorAt(revival.at) } : undefined, now));
      map.setPaintProperty("floors-faded", "fill-extrusion-color", floorColorExpression(revivedColors, revival ? { ...revival, at: firstFloorAt(revival.at) } : undefined, now));
      if (revival && now - revival.at < lightUpDuration(revival.floors)) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [revivedColors, revival, ready, buildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const target = buildings.find((b) => String(b.id) === (revival?.building_id ?? buildingId));
    const project = () => {
      const point = target?.lng != null && target.lat != null ? map.project([target.lng, target.lat]) : null;
      setFlashPoint((old) => old?.x === point?.x && old?.y === point?.y ? old : point);
    };
    project(); map.on("move", project);
    return () => { map.off("move", project); };
  }, [buildingId, revival, ready, buildings]);


  return <>
    {error && <div role="alert" style={{ padding: 10, background: "#5a3b00" }}>{error}</div>}
    <div data-testid="field" className="city-field" data-facts-ready={ready && factsReady} style={{ position: "relative", height: "100%", minHeight: 0, borderRadius: 12, overflow: "hidden", background: "#10131c" }}>
      {revival && flashPoint && <div key={revival.at} data-testid="revival-flash" data-soft={revival.auto_completed} aria-hidden="true" style={{ position: "absolute", top: flashPoint.y, left: flashPoint.x - 32, width: 64, height: 24, zIndex: 1, background: revival.auto_completed ? "#ffffff40" : "white", filter: "blur(18px)", animation: `city-flash ${FLASH_MS}ms forwards`, pointerEvents: "none" }} />}
      <style>{`@keyframes city-flash { from { opacity: 0.9 } to { opacity: 0 } }`}</style>
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      <Sparks target={flashPoint} />
      <PointerDots />
      <div style={{ position: "absolute", left: 16, top: 16, display: "grid", gap: 8, pointerEvents: "none" }}>
        {hovers.map((h) => <HoverCard key={`${dataMode}-${h.player}-${h.building}`} id={h.building} color={h.color} onError={factError} />)}
      </div>
    </div>
  </>;
}

/** Pointer traffic only rerenders the beams; facts, camera and subtitles stay idle. */
function PointerDots() {
  const { pointers, players } = useGame(useShallow(s => ({ pointers: s.pointers, players: s.players })));
  return <>{Object.entries(pointers).map(([id, p]) => <div key={id} data-testid="dot" style={{ pointerEvents: "none", position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: "50%", background: p.color, boxShadow: `0 0 16px 6px ${p.color}`, transition: "left 60ms linear, top 60ms linear" }}>
        <span style={{ position: "absolute", top: 26, fontSize: 28 }}>{players[id]?.nickname}</span>
      </div>)}</>;
}
