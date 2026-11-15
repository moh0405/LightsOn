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
import { SkylineAccents } from "./SkylineAccents";
import { FLASH_MS, firstFloorAt, INTRO_DIVE_MS, lightUpDuration } from "./effects";
import { fadedOccluders, frameCamera, frameVolume, occluders, planCamera, ROUND_PITCH } from "./camera";
import { facadeBands, groundGrid, roofEdges, smoothFlight, stickyHit, type Hit } from "./skyline";

declare global { interface Window { __lightsOnMap?: CityMap; __lightsOnFrameBuilding?: (id: string) => void } }
const CENTER: [number, number] = [-95.3650891, 29.7588018];
const FLOOR_COLOR = floorColorExpression({});
interface Hover { player: string; building: string; color: string; floor: number | null }

export function City() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<CityMap | null>(null);
  const { pointers, players, phase, buildingId, revivedColors, revival, dataMode, hasState } = useGame();
  const current = useRef({ pointers, phase, hovers: [] as Hover[] });
  const [ready, setReady] = useState(false);
  const [flashPoint, setFlashPoint] = useState<{ x: number; y: number } | null>(null);
  const [factsReady, setFactsReady] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [hovers, setHovers] = useState<Hover[]>([]);
  current.current = { pointers, phase, hovers };
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
        attributionControl: false, interactive: false,
        pixelRatio: Math.min(window.devicePixelRatio, 1.5),
        style: { version: 8, light: { anchor: "map", color: "#dce7ff", position: [1.5, 235, 48], intensity: 0.38 },
          sky: { "sky-color": "#070d1c", "horizon-color": "#354363", "fog-color": "#17243a", "sky-horizon-blend": 0.75, "horizon-fog-blend": 0.65 },
          sources: {}, layers: [{ id: "night", type: "background", paint: { "background-color": "#101b2b" } }] },
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
          map.addSource("ground-grid", { type: "geojson", data: groundGrid(city.value) });
          map.addLayer({ id: "ground-grid", type: "line", source: "ground-grid", paint: { "line-color": "#536984", "line-width": 1, "line-opacity": 0.18 } });
          map.addSource("city", { type: "geojson", data: city.value });
          map.addLayer({ id: "ground-edges", type: "line", source: "city", paint: { "line-color": "#34435c", "line-width": 1, "line-opacity": 0.45 } });
          map.addLayer({ id: "context", type: "fill-extrusion", source: "city", paint: { "fill-extrusion-color": "#29394e", "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } });
          map.addSource("roof-edges", { type: "geojson", data: roofEdges(city.value) });
          map.addLayer({ id: "roof-edges", type: "fill-extrusion", source: "roof-edges", paint: { "fill-extrusion-color": "#52647e", "fill-extrusion-base": ["get", "base_m"], "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-opacity": 0.55 } });
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
          map.addSource("windows", { type: "geojson", data: facadeBands(floors.value) });
          map.addLayer({ id: "windows", type: "fill-extrusion", source: "windows", paint: {
            "fill-extrusion-base": ["get", "base_m"], "fill-extrusion-height": ["get", "height_m"],
            "fill-extrusion-color": FLOOR_COLOR, "fill-extrusion-vertical-gradient": false,
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
    let orbit = 0;
    const rotate = () => {
      const now = performance.now();
      if (["EXPLORE", "LOBBY"].includes(current.current.phase) && !current.current.hovers.length && !testFrame.current && !map.isMoving() && overview.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const canvas = map.getCanvas();
        map.jumpTo(frameCamera(overview.current, canvas.clientWidth, canvas.clientHeight, map.getBearing() + (now - last) * 0.0015, ROUND_PITCH, map.getVerticalFieldOfView()));
      }
      last = now;
      orbit = requestAnimationFrame(rotate);
    };
    orbit = requestAnimationFrame(rotate);
    return () => {
      active = false; resize.disconnect(); cancelAnimationFrame(orbit); mapRef.current = null;
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
      if (map.getLayer("roof-edges")) map.setFilter("roof-edges", indexes.length ? ["!", ["in", ["get", "_i"], ["literal", indexes]]] : null);
      if (map.getLayer("floors-faded")) {
        map.setFilter("floors", floorIds.length ? ["!", ["in", ["get", "building_id"], ["literal", floorIds]]] : null);
        map.setFilter("floors-faded", ["in", ["get", "building_id"], ["literal", floorIds]]);
        map.setFilter("windows", floorIds.length ? ["!", ["in", ["get", "building_id"], ["literal", floorIds]]] : null);
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
      else map.flyTo({ ...camera, duration, easing: smoothFlight, essential: true });
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
    const hits = new Map<string, Hit>();
    let lastQuery = -Infinity;
    const update = () => {
      const now = performance.now();
      if (now - lastQuery < 40) return;
      lastQuery = now;
      const next: Hover[] = [];
      for (const [player, p] of Object.entries(current.current.pointers)) {
        // The visible beam is 22 px wide. A small hit area keeps its edge
        // responsive while the attract camera orbits and touch rounds pixels.
        const x = p.x * map.getCanvas().clientWidth, y = p.y * map.getCanvas().clientHeight;
        const feature = map.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]], { layers: ["floors"] })[0];
        const id = feature?.properties?.building_id;
        const hit = ["LOBBY", "EXPLORE"].includes(current.current.phase) ? stickyHit(hits.get(player) ?? null, id ? { building: String(id), floor: typeof feature.properties?.floor_number === "number" ? feature.properties.floor_number : null } : null, now) : null;
        if (hit) hits.set(player, hit); else hits.delete(player);
        const building = hit?.building;
        const layer = `hover-${player}`;
        if (!map.getLayer(layer)) {
          map.addLayer({ id: layer, type: "line", source: "floors", filter: ["==", ["get", "building_id"], ""], paint: { "line-color": p.color, "line-width": 2, "line-blur": 0.5 } });
          map.addLayer({ id: `${layer}-glow`, type: "fill-extrusion", source: "floors", filter: ["==", ["get", "building_id"], ""], paint: { "fill-extrusion-base": ["get", "base_m"], "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-color": p.color, "fill-extrusion-opacity": 0.18, "fill-extrusion-translate": [0, -5], "fill-extrusion-translate-anchor": "viewport" } });
          map.addLayer({ id: `${layer}-floor`, type: "fill-extrusion", source: "windows", filter: ["==", ["get", "building_id"], ""], paint: { "fill-extrusion-base": ["get", "base_m"], "fill-extrusion-height": ["get", "height_m"], "fill-extrusion-color": p.color, "fill-extrusion-opacity": 0.85, "fill-extrusion-vertical-gradient": false } });
        }
        const key = `${building ?? ""}/${hit?.floor ?? ""}`;
        if (outlined.get(layer) !== key) {
          map.setFilter(layer, ["==", ["get", "building_id"], building ?? ""]);
          map.setFilter(`${layer}-glow`, ["==", ["get", "building_id"], building ?? ""]);
          map.setFilter(`${layer}-floor`, ["all", ["==", ["get", "building_id"], building ?? ""], ["==", ["get", "floor_number"], hit?.floor ?? -1]]);
          outlined.set(layer, key);
        }
        if (building) next.push({ player, building, color: p.color, floor: hit?.floor ?? null });
      }
      for (const player of hits.keys()) if (!current.current.pointers[player]) hits.delete(player);
      for (const layer of outlined.keys()) {
        if (!current.current.pointers[layer.slice(6)]) {
          for (const id of [layer, `${layer}-glow`, `${layer}-floor`]) if (map.getLayer(id)) map.removeLayer(id);
          outlined.delete(layer);
        }
      }
      setHovers((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    update();
    const timer = setInterval(update, 40);
    return () => { clearInterval(timer); };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer("floors")) return;
    map.setPaintProperty("floors", "fill-extrusion-color-transition", { duration: 0 });
    map.setPaintProperty("floors-faded", "fill-extrusion-color-transition", { duration: 0 });
    map.setPaintProperty("windows", "fill-extrusion-color-transition", { duration: 0 });
    let frame = 0;
    const paint = () => {
      // Paint and scheduling must share one clock read so the final frame
      // cannot be dropped when the deadline is crossed during setPaintProperty.
      const now = Date.now();
      map.setPaintProperty("floors", "fill-extrusion-color", floorColorExpression(revivedColors, revival ? { ...revival, at: firstFloorAt(revival.at) } : undefined, now));
      map.setPaintProperty("floors-faded", "fill-extrusion-color", floorColorExpression(revivedColors, revival ? { ...revival, at: firstFloorAt(revival.at) } : undefined, now));
      map.setPaintProperty("windows", "fill-extrusion-color", floorColorExpression(revivedColors, revival ? { ...revival, at: firstFloorAt(revival.at) } : undefined, now));
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
      <div className="city-atmosphere" aria-hidden="true" />
      {ready && mapRef.current && geo.current.floors && <SkylineAccents map={mapRef.current} floors={geo.current.floors} selections={hovers} colors={revivedColors} revival={revival} />}
      {["LOBBY", "EXPLORE"].includes(phase) && <div className="skyline-guide">
        <span className="skyline-eyebrow">DOWNTOWN HOUSTON</span>
        <p>Aim your beam. Wake a building.</p>
        <div className="skyline-legend"><span><i style={{ background: "#1a1d2b" }} />Dark</span><span><i style={{ background: "#4a4636" }} />Partial</span><span><i style={{ background: "#f2c46d" }} />Occupied</span><span><i style={{ background: "#3a3f52" }} />Unknown</span></div>
      </div>}
      <Sparks target={flashPoint} />
      {Object.entries(pointers).map(([id, p]) => <div key={id} data-testid="dot" style={{ pointerEvents: "none", position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: "50%", background: p.color, boxShadow: `0 0 16px 6px ${p.color}`, transition: "left 60ms linear, top 60ms linear" }}>
        <span style={{ position: "absolute", top: 26, fontSize: 28 }}>{players[id]?.nickname}</span>
      </div>)}
      <div style={{ position: "absolute", left: 16, top: 16, display: "flex", flexWrap: "wrap", alignItems: "start", gap: 8, pointerEvents: "none", right: 16 }}>
        {hovers.map((h) => <HoverCard key={`${dataMode}-${h.player}-${h.building}`} id={h.building} floor={h.floor} color={h.color} onError={factError} />)}
      </div>
    </div>
  </>;
}
