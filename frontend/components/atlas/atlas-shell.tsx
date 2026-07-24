"use client"

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { AtlasHeader } from "@/components/atlas-header"
import { useAtlasCamera, type ZoomBand } from "@/hooks/use-atlas-camera"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { ingestEvent } from "@/lib/api/atlas-client"
import { searchOpportunities, SEARCH_STAGES } from "@/lib/api/demo-adapter"
import type {
  DataCoverage,
  Opportunity,
  RequestState,
  SearchRequest,
  SearchResponse,
} from "@/lib/api/types"
import { ATLAS_CITIES, detectTopic, topicLabel, type AtlasLayer, type TimeRange } from "@/lib/atlas-data"
import { cityFrame, FRAME_IDLE, FRAME_RESULTS, ZOOM_STEP } from "@/lib/atlas/camera"
import { projectCity } from "@/lib/atlas/signal-layout"
import { DEMO_CITIES, DEMO_QUERY, isDemoCityId, type DemoCityId } from "@/lib/demo/fixtures"
import { PREPARED_INGEST, PREPARED_INGEST_URL } from "@/lib/demo/ingest-fixture"
import { AnalysisOverlay } from "./analysis-overlay"
import { EventImport, INGEST_IDLE, type IngestUiState } from "./event-import"
import { LAYER_ORDER, LayerControls } from "./layer-controls"
import { OpportunityDrawer } from "./opportunity-drawer"
import { RequestBanner } from "./request-banner"
import { ResultRail } from "./result-rail"
import { SearchCommand } from "./search-command"
import { WorldMap } from "./world-map"

export type AtlasViewState = "idle" | "analyzing" | "results" | "selected" | "campaign"

// Máquina de estados central (§7) — nada de useState sueltos para view state.
// Desde el Bloque 3 el request vive acá como RequestState real (§10).
type AtlasState = {
  view: AtlasViewState
  searchText: string
  activeQuery: string
  searchRequest: SearchRequest | null
  request: RequestState
  response: SearchResponse | null
  results: Opportunity[]
  // "Use prepared demo" (§10): una vez activado, toda búsqueda siguiente va a
  // los fixtures — la presentación no vuelve a depender del backend.
  demoMode: boolean
  selectedCityId: DemoCityId | null
  // Retiene la última ciudad para que el contenido del panel no "pope" al cerrar.
  lastCityId: DemoCityId | null
  hoveredCityId: string | null
  layers: AtlasLayer[]
  timeRange: TimeRange
}

type AtlasAction =
  | { type: "QUERY_CHANGED"; text: string }
  | { type: "SEARCH_STARTED"; query: string; request: SearchRequest }
  | { type: "SEARCH_PROGRESSED"; stage: string }
  | { type: "SEARCH_SUCCEEDED"; response: SearchResponse }
  | { type: "SEARCH_FAILED"; message: string }
  | { type: "DEMO_MODE_ENTERED" }
  | { type: "OPPORTUNITY_HOVERED"; id: string | null }
  | { type: "OPPORTUNITY_SELECTED"; id: DemoCityId }
  | { type: "SELECTION_CLOSED" }
  | { type: "CAMPAIGN_OPENED" }
  | { type: "CAMPAIGN_CLOSED" }
  | { type: "LAYER_TOGGLED"; layer: AtlasLayer }
  | { type: "TIME_RANGE_CHANGED"; range: TimeRange }
  | { type: "DEMO_RESET" }

const INITIAL_STATE: AtlasState = {
  view: "idle",
  searchText: "",
  activeQuery: DEMO_QUERY,
  searchRequest: null,
  request: { status: "idle" },
  response: null,
  results: [],
  demoMode: false,
  selectedCityId: null,
  lastCityId: null,
  hoveredCityId: null,
  layers: ["demand", "events", "communities"],
  timeRange: "30d",
}

// Aviso honesto del estado partial (§10): qué falta y con qué se rankeó.
function partialMessage(coverage: DataCoverage): string {
  return `Partial results — sources unavailable: ${coverage.unavailableSources.join(", ")}. Ranking uses ${coverage.sourcesAvailable.length} of ${coverage.sourcesRequested.length} signal sources; live event listings are hidden.`
}

function atlasReducer(state: AtlasState, action: AtlasAction): AtlasState {
  switch (action.type) {
    case "QUERY_CHANGED":
      return { ...state, searchText: action.text }
    case "SEARCH_STARTED":
      if (state.view === "analyzing") return state
      return {
        ...state,
        view: "analyzing",
        searchText: action.query,
        activeQuery: action.query,
        searchRequest: action.request,
        request: { status: "loading", stage: SEARCH_STAGES[0].id },
        response: null,
        results: [],
        selectedCityId: null,
        hoveredCityId: null,
      }
    case "SEARCH_PROGRESSED":
      if (state.request.status !== "loading") return state
      return { ...state, request: { status: "loading", stage: action.stage } }
    case "SEARCH_SUCCEEDED": {
      if (state.view !== "analyzing") return state
      const coverage = action.response.dataCoverage
      return {
        ...state,
        view: "results",
        response: action.response,
        results: action.response.opportunities,
        request:
          coverage.unavailableSources.length > 0
            ? { status: "partial", message: partialMessage(coverage) }
            : { status: "success" },
      }
    }
    case "SEARCH_FAILED":
      if (state.view !== "analyzing") return state
      return { ...state, view: "idle", request: { status: "error", message: action.message, retryable: true } }
    case "DEMO_MODE_ENTERED":
      return { ...state, demoMode: true }
    case "OPPORTUNITY_HOVERED":
      return state.hoveredCityId === action.id ? state : { ...state, hoveredCityId: action.id }
    case "OPPORTUNITY_SELECTED":
      return { ...state, view: "selected", selectedCityId: action.id, lastCityId: action.id }
    case "SELECTION_CLOSED":
      return { ...state, view: "results", selectedCityId: null }
    case "CAMPAIGN_OPENED":
      return state.view === "selected" ? { ...state, view: "campaign" } : state
    case "CAMPAIGN_CLOSED":
      return state.view === "campaign" ? { ...state, view: "selected" } : state
    case "LAYER_TOGGLED":
      return {
        ...state,
        layers: state.layers.includes(action.layer)
          ? state.layers.filter((layer) => layer !== action.layer)
          : [...state.layers, action.layer],
      }
    case "TIME_RANGE_CHANGED":
      return { ...state, timeRange: action.range }
    case "DEMO_RESET":
      return {
        ...INITIAL_STATE,
        layers: state.layers,
        timeRange: state.timeRange,
        demoMode: state.demoMode,
      }
  }
}

function detectObjective(query: string): SearchRequest["objective"] {
  const text = query.toLowerCase()
  if (/talent|hiring|recruit/.test(text)) return "talent"
  if (/awareness|brand/.test(text)) return "awareness"
  if (/feedback/.test(text) && !/adoption/.test(text)) return "feedback"
  return "adoption"
}

function parseBudget(query: string): SearchRequest["budget"] {
  const thousands = /\$\s*(\d+(?:\.\d+)?)\s*k\b/i.exec(query)
  if (thousands) return { amount: Math.round(Number(thousands[1]) * 1000), currency: "USD" }
  const plain = /\$\s*(\d{3,})\b/.exec(query)
  return plain ? { amount: Number(plain[1]), currency: "USD" } : undefined
}

function buildSearchRequest(query: string, layers: AtlasLayer[], timeRange: TimeRange): SearchRequest {
  return { query, objective: detectObjective(query), budget: parseBudget(query), timeRange, layers }
}

function formatBudget(budget: SearchRequest["budget"]): string {
  if (!budget) return "Not set"
  return budget.amount % 1000 === 0 ? `$${budget.amount / 1000}K` : `$${budget.amount}`
}

export function AtlasShell() {
  const [state, dispatch] = useReducer(atlasReducer, INITIAL_STATE)
  const {
    view,
    searchText,
    activeQuery,
    searchRequest,
    request,
    response,
    results,
    demoMode,
    selectedCityId,
    lastCityId,
    hoveredCityId,
    layers,
    timeRange,
  } = state

  const [layersOpen, setLayersOpen] = useState(false)
  // Bottom sheet mobile (§12): medium 46svh ↔ tall 88svh vía el grabber.
  const [sheetTall, setSheetTall] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [zoomBand, setZoomBand] = useState<ZoomBand>({ zoomed: false, zoomed2: false })
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false })
  const [ingest, setIngest] = useState<IngestUiState>(INGEST_IDLE)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | null>(null)
  const scanTimer = useRef<number | null>(null)
  // Descartan resoluciones viejas (retry rápido, reset durante el análisis).
  const searchSeq = useRef(0)
  const ingestSeq = useRef(0)

  const reducedMotion = useReducedMotion()
  const camera = useAtlasCamera({ reducedMotion, onZoomBandChange: setZoomBand })

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true })
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast((current) => ({ ...current, visible: false })), 1800)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
    }
  }, [])

  const viewRef = useRef(view)
  const layersRef = useRef(layers)
  const timeRangeRef = useRef(timeRange)
  const demoModeRef = useRef(demoMode)
  const resultsRef = useRef(results)
  const selectedIdRef = useRef(selectedCityId)
  const ingestUrlRef = useRef(ingest.url)
  // Disparador de la selección (§12): al cerrar el panel, el foco vuelve acá.
  const triggerRef = useRef<HTMLElement | SVGElement | null>(null)
  useEffect(() => {
    viewRef.current = view
    layersRef.current = layers
    timeRangeRef.current = timeRange
    demoModeRef.current = demoMode
    resultsRef.current = results
    selectedIdRef.current = selectedCityId
    ingestUrlRef.current = ingest.url
  }, [view, layers, timeRange, demoMode, results, selectedCityId, ingest.url])

  const runSearch = useCallback(
    (query: string, forceDemo = false) => {
      if (viewRef.current === "analyzing") return
      const seq = ++searchSeq.current
      const builtRequest = buildSearchRequest(query, layersRef.current, timeRangeRef.current)
      dispatch({ type: "SEARCH_STARTED", query, request: builtRequest })
      setLayersOpen(false)
      // Banda de escaneo §5: 1.05s × 2 (el prototipo la retira a los 2200ms).
      if (!reducedMotion) {
        setScanning(true)
        if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
        scanTimer.current = window.setTimeout(() => setScanning(false), 2200)
      }
      searchOpportunities(builtRequest, {
        stageMs: reducedMotion ? 60 : 460,
        tailMs: reducedMotion ? 0 : 180,
        forceDemo: forceDemo || demoModeRef.current,
        onStage: (stageId) => {
          if (searchSeq.current === seq) dispatch({ type: "SEARCH_PROGRESSED", stage: stageId })
        },
      })
        .then((searchResponse) => {
          if (searchSeq.current !== seq) return
          dispatch({ type: "SEARCH_SUCCEEDED", response: searchResponse })
          camera.flyTo(FRAME_RESULTS, 900)
        })
        .catch((error: unknown) => {
          if (searchSeq.current !== seq) return
          setScanning(false)
          if (scanTimer.current !== null) window.clearTimeout(scanTimer.current)
          dispatch({
            type: "SEARCH_FAILED",
            message: error instanceof Error ? error.message : "Unexpected error.",
          })
        })
    },
    [reducedMotion, camera],
  )

  const retrySearch = useCallback(() => {
    runSearch(activeQuery || DEMO_QUERY)
  }, [runSearch, activeQuery])

  const usePreparedDemo = useCallback(() => {
    dispatch({ type: "DEMO_MODE_ENTERED" })
    runSearch(activeQuery || DEMO_QUERY, true)
  }, [runSearch, activeQuery])

  const selectCity = useCallback(
    (id: string) => {
      if (!isDemoCityId(id)) return
      // Se captura el disparador solo al ABRIR el panel: los cambios ciudad→ciudad
      // (rail, swipe) no lo pisan — cerrar vuelve siempre al primer disparador.
      if (viewRef.current !== "selected" && viewRef.current !== "campaign") {
        const active = document.activeElement
        triggerRef.current =
          active instanceof HTMLElement || active instanceof SVGElement ? active : null
      }
      dispatch({ type: "OPPORTUNITY_SELECTED", id })
      const opportunity = resultsRef.current.find((item) => item.id === id)
      if (opportunity) {
        const [x, y] = projectCity(opportunity.coordinates[0], opportunity.coordinates[1])
        camera.flyTo(cityFrame(x, y, window.innerWidth, window.innerHeight), 820)
      }
    },
    [camera],
  )

  const closeSelection = useCallback(() => {
    const closedId = selectedIdRef.current
    dispatch({ type: "SELECTION_CLOSED" })
    // Cerrar vuelve al encuadre de resultados, no al mundo completo (§6).
    camera.flyTo(FRAME_RESULTS, 780)
    // Retorno de foco (§12): al disparador si sigue en el DOM; si no, al item
    // del rail de esa ciudad (la alternativa navegable al SVG).
    const trigger = triggerRef.current
    triggerRef.current = null
    requestAnimationFrame(() => {
      if (trigger && trigger.isConnected) {
        ;(trigger as HTMLElement).focus()
      } else if (closedId) {
        document
          .querySelector<HTMLButtonElement>(`.rail-item[data-id="${closedId}"]`)
          ?.focus()
      }
    })
  }, [camera])

  // Campaña §9: mismo drawer, sin mover la cámara — solo cambia la vista interna.
  const openCampaign = useCallback(() => dispatch({ type: "CAMPAIGN_OPENED" }), [])
  const closeCampaign = useCallback(() => dispatch({ type: "CAMPAIGN_CLOSED" }), [])

  const resetDemo = useCallback(() => {
    searchSeq.current++
    ingestSeq.current++
    dispatch({ type: "DEMO_RESET" })
    setLayersOpen(false)
    setSheetTall(false)
    setScanning(false)
    setIngest(INGEST_IDLE)
    camera.flyTo(FRAME_IDLE, 900)
  }, [camera])

  const toggleSheet = useCallback(() => setSheetTall((tall) => !tall), [])

  const runImport = useCallback(() => {
    const url = ingestUrlRef.current.trim() || PREPARED_INGEST_URL
    const seq = ++ingestSeq.current
    setIngest({ url, request: { status: "loading", stage: "fetching" }, result: null, prepared: false })
    ingestEvent(url)
      .then((result) => {
        if (ingestSeq.current !== seq) return
        if (result.extraction.status === "failed" || !result.event) {
          setIngest({
            url,
            request: {
              status: "error",
              message: result.extraction.warnings[0] ?? "could not read the event page",
              retryable: true,
            },
            result: null,
            prepared: false,
          })
          return
        }
        setIngest({
          url,
          request:
            result.extraction.status === "partial"
              ? { status: "partial", message: result.extraction.warnings.join(" · ") }
              : { status: "success" },
          result,
          prepared: false,
        })
      })
      .catch(() => {
        if (ingestSeq.current !== seq) return
        setIngest({
          url,
          request: { status: "error", message: "the ingest endpoint didn't respond", retryable: true },
          result: null,
          prepared: false,
        })
      })
  }, [])

  const usePreparedImport = useCallback(() => {
    ingestSeq.current++
    setIngest({ url: PREPARED_INGEST_URL, request: { status: "success" }, result: PREPARED_INGEST, prepared: true })
  }, [])

  const changeIngestUrl = useCallback((url: string) => {
    setIngest((current) => ({ ...current, url }))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLayersOpen(false)
        if (viewRef.current === "campaign") dispatch({ type: "CAMPAIGN_CLOSED" })
        else if (viewRef.current === "selected") closeSelection()
      }
      // El atajo "/" no puede robar el foco mientras se tipea en OTRO campo
      // (p. ej. la URL de Luma contiene "/" — sin este guard, importaba a medias).
      const active = document.activeElement
      const typing =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
      if (event.key === "/" && !typing) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [closeSelection])

  const setSearchText = useCallback((text: string) => dispatch({ type: "QUERY_CHANGED", text }), [])
  const hoverCity = useCallback((id: string | null) => dispatch({ type: "OPPORTUNITY_HOVERED", id }), [])
  const toggleLayer = useCallback((layer: AtlasLayer) => dispatch({ type: "LAYER_TOGGLED", layer }), [])

  const changeTimeRange = useCallback(
    (range: TimeRange) => {
      dispatch({ type: "TIME_RANGE_CHANGED", range })
      showToast(`Window: ${range.toUpperCase()} · demo signals`)
    },
    [showToast],
  )

  const resetZoom = useCallback(() => {
    // Con el panel abierto, "Reset view" recupera el encuadre de la ciudad — no
    // FRAME_IDLE (quirk del prototipo que dejaba el mundo entero detrás del panel).
    const currentView = viewRef.current
    if (currentView === "selected" || currentView === "campaign") {
      const id = selectedIdRef.current
      const opportunity = id ? resultsRef.current.find((item) => item.id === id) : undefined
      if (opportunity) {
        const [x, y] = projectCity(opportunity.coordinates[0], opportunity.coordinates[1])
        camera.flyTo(cityFrame(x, y, window.innerWidth, window.innerHeight), 700)
        return
      }
    }
    camera.flyTo(currentView === "results" ? FRAME_RESULTS : FRAME_IDLE, 700)
  }, [camera])

  const displayCityId = selectedCityId ?? lastCityId
  const displayCity = displayCityId ? DEMO_CITIES[displayCityId] : null
  const displayAtlasCity = displayCityId ? ATLAS_CITIES.find((city) => city.id === displayCityId) : null
  const collabNote =
    displayCity && displayAtlasCity
      ? `${displayAtlasCity.companiesExploring} companies are exploring ${displayCity.name} for ${topicLabel(detectTopic(activeQuery))}.`
      : null

  // El overlay refleja el stage real del request — sin timers propios (§5/§10).
  const stageIndex =
    request.status === "loading"
      ? Math.max(0, SEARCH_STAGES.findIndex((stage) => stage.id === request.stage))
      : request.status === "error"
        ? -1
        : SEARCH_STAGES.length

  const chips = response
    ? {
        product: response.interpretation.category,
        objective: response.interpretation.objective,
        budget: formatBudget(searchRequest?.budget),
      }
    : null

  const searchMeta = response ? { searchId: response.searchId, generatedAt: response.generatedAt } : null
  const eventFeedDown = response !== null && response.dataCoverage.unavailableSources.length > 0

  const layerOffClasses = LAYER_ORDER.filter((layer) => !layers.includes(layer))
    .map((layer) => ` layer-off-${layer}`)
    .join("")
  const zoomClasses = `${zoomBand.zoomed ? " zoomed" : ""}${zoomBand.zoomed2 ? " zoomed2" : ""}`
  // Con un error la search queda compacta arriba: el banner vive debajo de ella.
  const compact = view !== "idle" || request.status === "error"
  const shellClassName = `atlas state-${view}${compact ? " search-compact" : ""}${sheetTall ? " sheet-tall" : ""}${scanning ? " scanning" : ""}${zoomClasses}${layerOffClasses}`

  return (
    <div className={shellClassName}>
      {/* Orden del DOM = orden de tab (§12): search → layers → rail → marcadores
          (dentro del mapa) → panel → CTA. El mapa va al fondo por z-index, no por
          orden (todos los overlays tienen z-index explícito). */}
      <AtlasHeader view={view} onReset={resetDemo} />

      <SearchCommand
        value={searchText}
        onValueChange={setSearchText}
        onSearch={runSearch}
        chips={chips}
        inputRef={searchInputRef}
      >
        <RequestBanner request={request} onRetry={retrySearch} onUsePreparedDemo={usePreparedDemo} />
      </SearchCommand>

      <LayerControls
        layers={layers}
        onToggleLayer={toggleLayer}
        timeRange={timeRange}
        onTimeRangeChange={changeTimeRange}
        open={layersOpen}
        onOpenChange={setLayersOpen}
      />

      <ResultRail results={results} selectedCityId={selectedCityId} onSelect={selectCity} onHover={hoverCity} />

      <WorldMap
        camera={camera}
        view={view}
        results={results}
        selectedCityId={selectedCityId}
        hoveredCityId={hoveredCityId}
        timeRange={timeRange}
        onSelect={selectCity}
        onHover={hoverCity}
      />

      <div className="scan" aria-hidden="true">
        <div className="band" />
        <div className="edge" />
      </div>

      <AnalysisOverlay active={view === "analyzing"} stageIndex={stageIndex} />

      <OpportunityDrawer
        city={displayCity}
        cityId={displayCityId}
        open={view === "selected" || view === "campaign"}
        campaign={view === "campaign"}
        sheetTall={sheetTall}
        onToggleSheet={toggleSheet}
        collabNote={collabNote}
        searchMeta={searchMeta}
        eventFeedDown={eventFeedDown}
        importSlot={
          <EventImport
            ingest={ingest}
            onUrlChange={changeIngestUrl}
            onImport={runImport}
            onUsePrepared={usePreparedImport}
          />
        }
        onClose={closeSelection}
        onGenerateCampaign={openCampaign}
        onBackToOpportunity={closeCampaign}
        onToast={showToast}
      />

      <div className="zoom-ctl">
        <button className="zoom-btn" type="button" aria-label="Zoom in" onClick={() => camera.zoomBy(ZOOM_STEP)}>
          <Plus size={14} strokeWidth={1.8} />
        </button>
        <button className="zoom-btn" type="button" aria-label="Zoom out" onClick={() => camera.zoomBy(1 / ZOOM_STEP)}>
          <Minus size={14} strokeWidth={1.8} />
        </button>
        <button className="zoom-btn" type="button" aria-label="Reset view" onClick={resetZoom}>
          <RotateCcw size={13} strokeWidth={1.8} />
        </button>
      </div>

      <p className="footnote">Prepared demo — signals simulated · dot density = matched signal volume</p>

      <div className={`toast${toast.visible ? " show" : ""}`} role="status">
        {toast.message}
      </div>
    </div>
  )
}
