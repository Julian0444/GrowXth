"use client"

import { memo } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"
import type { AtlasCamera } from "@/hooks/use-atlas-camera"
import type { Opportunity } from "@/lib/api/types"
import { MAP_HEIGHT, MAP_WIDTH, PROJECTION_CENTER, PROJECTION_SCALE } from "@/lib/atlas/signal-layout"
import { DEMO_CITIES, isDemoCityId } from "@/lib/demo/fixtures"
import type { AtlasViewState } from "./atlas-shell"
import { OpportunityMarker } from "./opportunity-marker"
import { SignalCloudLayer } from "./signal-cloud-layer"

const GEO_URL = "/geo/countries-110m.json"

// Solo re-renderiza al cambiar el país activo — los vuelos de cámara no tocan React.
const LandLayer = memo(function LandLayer({ activeGeo }: { activeGeo: string | null }) {
  return (
    <g className="atlas-land">
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies
            .filter((geography) => geography.id !== "010")
            .map((geography) => {
              const active = activeGeo !== null && geography.id === activeGeo
              return (
                <Geography
                  key={geography.rsmKey}
                  geography={geography}
                  fill="var(--land)"
                  stroke={active ? "var(--border-geo-active)" : "var(--border-geo)"}
                  strokeWidth={active ? 1 : 0.6}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "var(--land)" },
                    pressed: { outline: "none", fill: "var(--land)" },
                  }}
                  tabIndex={-1}
                />
              )
            })
        }
      </Geographies>
    </g>
  )
})

export const WorldMap = memo(function WorldMap({
  camera,
  view,
  results,
  selectedCityId,
  hoveredCityId,
  timeRange,
  onSelect,
  onHover,
}: {
  camera: AtlasCamera
  view: AtlasViewState
  // Marcadores desde la respuesta (§10) — montan recién cuando hay resultados.
  results: readonly Opportunity[]
  selectedCityId: string | null
  hoveredCityId: string | null
  timeRange: string
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const activeGeo =
    selectedCityId && isDemoCityId(selectedCityId) ? DEMO_CITIES[selectedCityId].geo : null

  return (
    <div className="map-stage" ref={camera.stageRef}>
      {/* slice = cover fit, como el prototipo: S = max(vw/980, vh/560) */}
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: PROJECTION_SCALE, center: PROJECTION_CENTER }}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        aria-label="World map of growth opportunity signals"
      >
        <defs>
          <radialGradient id="haloG">
            <stop offset="0%" stopColor="rgba(17,17,17,0.05)" />
            <stop offset="62%" stopColor="rgba(17,17,17,0.022)" />
            <stop offset="100%" stopColor="rgba(17,17,17,0)" />
          </radialGradient>
        </defs>
        {/* La cámara (hooks/use-atlas-camera) setea el transform de este grupo por rAF. */}
        <g ref={camera.groupRef}>
          <LandLayer activeGeo={activeGeo} />
          <SignalCloudLayer
            view={view}
            selectedCityId={selectedCityId}
            hintCityId={hoveredCityId}
            timeRange={timeRange}
          />
          {results.map((opportunity) => (
            <OpportunityMarker
              key={opportunity.id}
              id={opportunity.id}
              name={opportunity.city}
              rank={opportunity.rank}
              score={opportunity.score}
              confidence={opportunity.confidence}
              coordinates={opportunity.coordinates}
              selected={selectedCityId === opportunity.id}
              hovered={hoveredCityId === opportunity.id}
              onSelect={onSelect}
              onHover={onHover}
              registerNode={camera.registerMarker}
            />
          ))}
        </g>
      </ComposableMap>
    </div>
  )
})
