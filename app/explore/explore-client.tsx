"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  addProtocol,
  removeProtocol,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

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
      { id: "space", type: "background", paint: { "background-color": "#050810" } },
      {
        id: "eco-fill",
        type: "fill",
        source: "ecoregions",
        "source-layer": SOURCE_LAYER,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.95,
            ["boolean", ["feature-state", "hover"], false],
            0.8,
            0.55,
          ],
        },
      },
      {
        id: "eco-line",
        type: "line",
        source: "ecoregions",
        "source-layer": SOURCE_LAYER,
        paint: {
          "line-color": "rgba(255, 255, 255, 0.14)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 6, 1],
        },
      },
    ],
  };
}

const textShadow = { textShadow: "0 2px 24px rgba(0, 0, 0, 0.9), 0 1px 4px rgba(0, 0, 0, 0.8)" };

export function ExploreClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [index, setIndex] = useState<Map<number, Ecoregion> | null>(null);
  const [selected, setSelected] = useState<Ecoregion | null>(null);
  const [hovered, setHovered] = useState<Ecoregion | null>(null);
  const [ready, setReady] = useState(false);
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

    map.on("mousemove", "eco-fill", (e) => {
      const f = e.features?.[0];
      const id = typeof f?.id === "number" ? f.id : null;
      if (id === hoverId) return;
      setState(hoverId, "hover", false);
      hoverId = id;
      setState(hoverId, "hover", true);
      map.getCanvas().style.cursor = id === null ? "" : "pointer";
      setHovered(id === null ? null : (indexRef.current?.get(id) ?? null));
    });

    map.on("mouseleave", "eco-fill", () => {
      setState(hoverId, "hover", false);
      hoverId = null;
      map.getCanvas().style.cursor = "";
      setHovered(null);
    });

    map.on("click", "eco-fill", (e) => {
      const f = e.features?.[0];
      const id = typeof f?.id === "number" ? f.id : null;
      setState(selectedId, "selected", false);
      selectedId = id;
      setState(selectedId, "selected", true);
      setSelected(id === null ? null : (indexRef.current?.get(id) ?? null));
    });

    return () => {
      map.remove();
      removeProtocol("pmtiles");
      mapRef.current = null;
    };
  }, []);

  const shown = selected ?? hovered;

  return (
    <main className="relative h-svh w-full overflow-hidden" style={{ background: "#050810" }}>
      <div ref={containerRef} className="absolute inset-0" />

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

      {/* ecoregion card */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[6svh] flex justify-center px-[var(--space-5)] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-[6vw] md:-translate-y-1/2 md:justify-start"
        style={{
          opacity: shown ? 1 : 0,
          transition: "opacity var(--duration-base) var(--ease-gentle)",
        }}
      >
        {shown ? (
          <div className="w-full max-w-xs text-left md:max-w-sm" style={textShadow}>
            <p
              className="font-medium uppercase"
              style={{
                fontSize: "var(--text-caption)",
                letterSpacing: "var(--tracking-caps)",
                color: shown.color,
              }}
            >
              {selected ? "Ecoregion" : "Hovering"}
            </p>
            <h1
              className="mt-1 font-semibold"
              style={{
                fontSize: "clamp(1.6rem, 1.2rem + 1.4vw, 2.8rem)",
                letterSpacing: "var(--tracking-title)",
                lineHeight: "var(--leading-tight)",
              }}
            >
              {shown.name}
            </h1>
            <dl className="mt-[var(--space-5)] grid gap-[var(--space-2)]">
              {(
                [
                  ["Biome", shown.biome],
                  ["Realm", shown.realm],
                  ["Protection outlook", shown.nnh],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-[var(--space-4)]"
                  style={{ fontSize: "clamp(0.95rem, 0.8rem + 0.45vw, 1.3rem)" }}
                >
                  <dt style={{ color: "rgba(255, 255, 255, 0.72)" }}>{label}</dt>
                  <dd className="text-right" style={{ color: "var(--fg)" }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {selected ? (
              <p
                className="mt-[var(--space-5)]"
                style={{
                  color: "rgba(255, 255, 255, 0.82)",
                  fontSize: "clamp(0.95rem, 0.8rem + 0.45vw, 1.25rem)",
                  lineHeight: "var(--leading-relaxed)",
                }}
              >
                The species that live here are on their way.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* first hint */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[8svh] left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 uppercase"
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
