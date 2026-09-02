"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  addProtocol,
  removeProtocol,
  setWorkerUrl,
  type DataDrivenPropertyValueSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ROCK_AND_ICE_ID,
  ecoregionColor,
  ecoregionColorExpression,
} from "@/lib/biome-palette";

interface Ecoregion {
  id: number;
  name: string;
  biomeNum: number;
  biome: string;
  realm: string;
  nnh: string;
  color: string;
  bbox: [number, number, number, number];
}

const SOURCE_LAYER = "ecoregions";
// an id no ecoregion has, for filters that should match nothing
const NO_SELECTION = -1;

function buildStyle(origin: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      ecoregions: {
        type: "vector",
        url: `pmtiles://${origin}/data/ecoregions.pmtiles`,
        promoteId: "id",
      },
    },
    layers: [
      // In globe projection the background layer paints only the sphere,
      // so this is the ocean; the page's darker #050810 around it is
      // space, and the contrast is what makes the planet's edge legible.
      { id: "ocean", type: "background", paint: { "background-color": "#0d2137" } },
      {
        id: "eco-fill",
        type: "fill",
        source: "ecoregions",
        "source-layer": SOURCE_LAYER,
        paint: {
          // biome-true colors (sand deserts, climate greens, no-data
          // grey for Rock and Ice); near-full opacity so they read as
          // themselves, not space-tinted
          "fill-color": ecoregionColorExpression() as DataDrivenPropertyValueSpecification<string>,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            ["boolean", ["feature-state", "hover"], false],
            0.97,
            0.88,
          ],
        },
      },
      {
        id: "eco-line",
        type: "line",
        source: "ecoregions",
        "source-layer": SOURCE_LAYER,
        paint: {
          // dark seams: visible on the light biomes, quiet on the deep ones
          "line-color": "rgba(8, 12, 20, 0.45)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 6, 1],
        },
      },
      {
        id: "eco-line-selected",
        type: "line",
        source: "ecoregions",
        "source-layer": SOURCE_LAYER,
        // the filter follows the selection, so this layer's buffers hold
        // one region's outline, not an invisible copy of all 847
        filter: ["==", ["get", "id"], NO_SELECTION],
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 6, 2.2],
          "line-opacity": 0.9,
        },
      },
    ],
  };
}


export function ExploreClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [index, setIndex] = useState<Map<number, Ecoregion> | null>(null);
  const [selected, setSelected] = useState<Ecoregion | null>(null);
  const [hovered, setHovered] = useState<Ecoregion | null>(null);
  const [ready, setReady] = useState(false);
  // the tooltip chases the pointer via direct style writes — a React
  // state round-trip per mousemove would be wasted work
  const tooltipRef = useRef<HTMLDivElement>(null);
  // the map's event closures read the latest index through a ref
  const indexRef = useRef<Map<number, Ecoregion> | null>(null);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    fetch("/data/ecoregions-index.json")
      .then((r) => r.json())
      .then((rows: Ecoregion[]) => setIndex(new Map(rows.map((e) => [e.id, e]))))
      .catch(() => setIndex(new Map()));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // MapLibre's module worker cannot be resolved by the bundler, so a
    // copy ships in /public (scripts/copy-maplibre-worker.mjs).
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);

    const map = new MapLibreMap({
      container,
      style: buildStyle(window.location.origin),
      center: [12, 28],
      zoom: 1.6,
      minZoom: 1,
      maxZoom: 9,
      attributionControl: false,
      dragRotate: false,
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__exploreMap = map;
      map.on("error", (e) => console.error("[map error]", e.error?.message ?? e));
    }

    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: "Ecoregions: RESOLVE 2017, CC BY 4.0",
      }),
      "bottom-right",
    );

    let hoverId: number | null = null;
    let selectedId: number | null = null;
    const setState = (id: number | null, key: "hover" | "selected", value: boolean) => {
      if (id === null) return;
      map.setFeatureState(
        { source: "ecoregions", sourceLayer: SOURCE_LAYER, id },
        { [key]: value },
      );
    };

    map.on("load", () => {
      map.setProjection({ type: "globe" });
      setReady(true);
    });

    // The globe projection maps screen points BESIDE the planet onto
    // its far side, so feature queries there hit invisible regions.
    // A visible point survives the unproject/project round trip.
    const onGlobe = (p: { x: number; y: number }) => {
      const q = map.project(map.unproject([p.x, p.y]));
      return Math.hypot(q.x - p.x, q.y - p.y) < 1.5;
    };

    const clearHover = () => {
      setState(hoverId, "hover", false);
      hoverId = null;
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    // Hover picking is a polygon hit-test over dense geometry, too heavy
    // to run per mousemove event on fast pointers. The pointer position
    // lands here at full rate; the hit-test runs at most once a frame.
    let hoverRaf = 0;
    let pointerAt: { x: number; y: number } | null = null;

    const pickHover = () => {
      hoverRaf = 0;
      const p = pointerAt;
      if (!p || !map.getLayer("eco-fill")) return;
      if (!onGlobe(p)) {
        clearHover();
        return;
      }
      const f = map.queryRenderedFeatures([p.x, p.y], { layers: ["eco-fill"] })[0];
      // Rock and Ice carries no data, so it does not answer the pointer
      const id = typeof f?.id === "number" && f.id !== ROCK_AND_ICE_ID ? f.id : null;
      if (id === hoverId) return;
      setState(hoverId, "hover", false);
      hoverId = id;
      setState(hoverId, "hover", true);
      map.getCanvas().style.cursor = id === null ? "" : "pointer";
      setHovered(id === null ? null : (indexRef.current?.get(id) ?? null));
    };
    const schedulePick = () => {
      if (!hoverRaf) hoverRaf = requestAnimationFrame(pickHover);
    };

    map.on("mousemove", (e) => {
      pointerAt = { x: e.point.x, y: e.point.y };
      // the name label rides just off the pointer, wherever it is
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 18}px)`;
      }
      schedulePick();
    });

    // zooming moves the world under a still pointer; re-pick when it settles
    map.on("moveend", schedulePick);

    map.on("mouseout", () => {
      pointerAt = null;
      clearHover();
    });

    const select = (id: number | null) => {
      setState(selectedId, "selected", false);
      selectedId = id;
      setState(selectedId, "selected", true);
      if (map.getLayer("eco-line-selected")) {
        map.setFilter("eco-line-selected", ["==", ["get", "id"], id ?? NO_SELECTION]);
      }
      setSelected(id === null ? null : (indexRef.current?.get(id) ?? null));
    };

    map.on("click", "eco-fill", (e) => {
      if (!onGlobe(e.point)) return; // space beside the globe, not this region
      const f = e.features?.[0];
      // clicking the dataless Rock and Ice clears the card, like ocean
      select(typeof f?.id === "number" && f.id !== ROCK_AND_ICE_ID ? f.id : null);
    });

    // a click on open water or space puts the card away
    map.on("click", (e) => {
      if (!onGlobe(e.point)) {
        select(null);
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, {
        layers: map.getLayer("eco-fill") ? ["eco-fill"] : [],
      });
      if (hits.length === 0) select(null);
    });

    return () => {
      cancelAnimationFrame(hoverRaf);
      map.remove();
      removeProtocol("pmtiles");
      mapRef.current = null;
    };
  }, []);

  // the card keeps its last region through the fade-out
  const [cardRegion, setCardRegion] = useState<Ecoregion | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- retains the last region through the fade-out
    if (selected) setCardRegion(selected);
  }, [selected]);

  return (
    <main className="relative h-svh w-full overflow-hidden" style={{ background: "#050810" }}>
      {/* arriving from the hero: the globe fades up out of the dark.
          Position and inset are inline because maplibre-gl.css forces
          position: relative on the container it adopts, and stylesheet
          order decides whether that beats a Tailwind class; with a
          relative 0-height container the canvas clips to nothing. */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          opacity: ready ? 1 : 0,
          transition: "opacity var(--duration-ambient) var(--ease-gentle)",
        }}
      />

      {/* way back */}
      <Link
        href="/"
        className="absolute top-[var(--space-5)] left-[var(--space-5)] rounded-full px-4 py-1.5 uppercase"
        style={{
          fontSize: "var(--text-caption)",
          letterSpacing: "var(--tracking-caps)",
          color: "var(--fg)",
          background: "rgba(5, 8, 16, 0.6)",
          boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.18)",
        }}
      >
        Earth
      </Link>

      {/* the hovered region's name rides just off the pointer, so the
          eye never has to leave the place it is exploring */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute top-0 left-0"
        style={{ willChange: "transform" }}
      >
        <div
          className="w-max max-w-[16rem] rounded-lg px-3 py-1.5"
          style={{
            background: "rgba(5, 8, 16, 0.82)",
            boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.16)",
            color: "var(--fg)",
            fontSize: "0.9rem",
            lineHeight: "var(--leading-snug)",
            opacity: hovered && hovered.id !== selected?.id ? 1 : 0,
          }}
        >
          {hovered?.name}
        </div>
      </div>

      {/* selected ecoregion: a docked card on its own surface, so the
          text stays readable over any biome at any zoom */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[6svh] flex justify-center px-[var(--space-5)] md:inset-x-auto md:bottom-[8svh] md:left-[4vw] md:justify-start"
        style={{
          opacity: selected ? 1 : 0,
          transition: "opacity var(--duration-base) var(--ease-gentle)",
        }}
      >
        {cardRegion ? (
          <div
            className="w-full max-w-xs rounded-2xl p-[var(--space-5)] text-left md:max-w-sm"
            style={{
              background: "rgba(5, 8, 16, 0.78)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.14)",
            }}
          >
            <p
              className="font-medium uppercase"
              style={{
                fontSize: "var(--text-caption)",
                letterSpacing: "var(--tracking-caps)",
                color: ecoregionColor(cardRegion.biomeNum, cardRegion.id),
              }}
            >
              Ecoregion
            </p>
            <h1
              className="mt-1 font-semibold"
              style={{
                fontSize: "clamp(1.5rem, 1.1rem + 1.2vw, 2.4rem)",
                letterSpacing: "var(--tracking-title)",
                lineHeight: "var(--leading-tight)",
              }}
            >
              {cardRegion.name}
            </h1>
            <dl className="mt-[var(--space-4)] grid gap-[var(--space-2)]">
              {(
                [
                  ["Biome", cardRegion.biome],
                  ["Realm", cardRegion.realm],
                  ["Protection outlook", cardRegion.nnh],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-[var(--space-4)]"
                  style={{ fontSize: "clamp(0.9rem, 0.8rem + 0.3vw, 1.1rem)" }}
                >
                  <dt style={{ color: "rgba(255, 255, 255, 0.72)" }}>{label}</dt>
                  <dd className="text-right" style={{ color: "var(--fg)" }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p
              className="mt-[var(--space-4)]"
              style={{
                color: "rgba(255, 255, 255, 0.82)",
                fontSize: "clamp(0.9rem, 0.8rem + 0.3vw, 1.05rem)",
                lineHeight: "var(--leading-relaxed)",
              }}
            >
              The species that live here are on their way.
            </p>
          </div>
        ) : null}
      </div>

      {/* first hint */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[8svh] left-1/2 w-max max-w-[92vw] -translate-x-1/2 rounded-full px-4 py-1.5 text-center uppercase"
        style={{
          fontSize: "var(--text-caption)",
          letterSpacing: "var(--tracking-caps)",
          color: "var(--fg)",
          background: "rgba(5, 8, 16, 0.6)",
          boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.18)",
          opacity: ready && !selected && !hovered ? 1 : 0,
          transition: "opacity var(--duration-ambient) var(--ease-gentle)",
        }}
      >
        Touch any place on land
      </div>
    </main>
  );
}
