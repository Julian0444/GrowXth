"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRight, X } from "lucide-react"
import type { DemoCity, DemoMetrics } from "@/lib/demo/fixtures"
import type { Evidence, Play, Reason } from "@/lib/contracts/growxth"
import { CampaignPanel } from "./campaign-panel"
import { ConfidenceBars } from "./confidence-bars"
import { EvidenceLinks } from "./evidence-links"
import { PlayHeadline } from "./play-headline"

// Línea de auditoría del response (§10): searchId + generatedAt reales.
export type SearchMeta = { searchId: string; generatedAt: string }

// La vista de campaña (§9) comparte el nodo del drawer con la de oportunidad;
// el cambio entre ambas usa el mismo crossfade que ciudad→ciudad.
type DrawerMode = "opportunity" | "campaign"

const METRIC_ROWS: [string, keyof DemoMetrics][] = [
  ["Demand", "demand"],
  ["Developer fit", "developerFit"],
  ["Event momentum", "eventMomentum"],
  ["Cost efficiency", "costEfficiency"],
  ["Competition gap", "competitionGap"],
]

export function OpportunityDrawer({
  city,
  cityId,
  open,
  campaign,
  sheetTall,
  onToggleSheet,
  collabNote,
  searchMeta,
  eventFeedDown,
  importSlot,
  onClose,
  onGenerateCampaign,
  onBackToOpportunity,
  onToast,
  // Props NUEVAS opcionales (aditivas): alimentan los 3 componentes nuevos con
  // datos del contrato nuevo. Ausentes → el drawer se comporta igual que antes.
  play,
  evidence,
  evidenceReasons,
  liveConfidence,
  consensus,
}: {
  city: DemoCity | null
  cityId: string | null
  open: boolean
  campaign: boolean
  // Bottom sheet mobile (§12): el grabber alterna medium (46svh) ↔ tall (88svh).
  sheetTall: boolean
  onToggleSheet: () => void
  collabNote: string | null
  searchMeta: SearchMeta | null
  // dataCoverage §10: con las fuentes de eventos caídas se dice, no se muestra
  // un evento potencialmente viejo.
  eventFeedDown: boolean
  importSlot: ReactNode
  onClose: () => void
  onGenerateCampaign: () => void
  onBackToOpportunity: () => void
  onToast: (message: string) => void
  play?: Play | null
  evidence?: Record<string, Evidence>
  evidenceReasons?: Reason[]
  liveConfidence?: number | null
  consensus?: number | null
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const targetMode: DrawerMode = campaign ? "campaign" : "opportunity"

  // Ciudad→ciudad y oportunidad↔campaña sin desmontar el panel (§6/§9): el contenido
  // mostrado va detrás del objetivo — 160ms de salida (.fade-swap) y remonte con fade-in.
  const [displayed, setDisplayed] = useState<{
    id: string | null
    city: DemoCity | null
    mode: DrawerMode
  }>({ id: cityId, city, mode: targetMode })
  const swapping =
    open &&
    displayed.id !== null &&
    cityId !== null &&
    (displayed.id !== cityId || displayed.mode !== targetMode)

  useEffect(() => {
    if (displayed.id === cityId && displayed.city === city && displayed.mode === targetMode) return
    // Con el panel cerrado (o primera apertura) se sincroniza sin crossfade.
    const delay = open && displayed.id !== null && cityId !== null ? 160 : 0
    const timer = window.setTimeout(() => setDisplayed({ id: cityId, city, mode: targetMode }), delay)
    return () => window.clearTimeout(timer)
  }, [open, cityId, city, targetMode, displayed])

  useEffect(() => {
    if (!open || !displayed.id) return
    scrollRef.current?.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [open, displayed.id, displayed.mode])

  const shown = displayed.city

  return (
    <aside
      className="drawer"
      aria-label={displayed.mode === "campaign" ? "Campaign draft" : "Opportunity details"}
      inert={!open}
    >
      <button
        className="grabber"
        type="button"
        aria-expanded={sheetTall}
        aria-label={sheetTall ? "Collapse panel" : "Expand panel"}
        onClick={onToggleSheet}
      >
        <i aria-hidden="true" />
      </button>
      <div className="drawer-scroll" ref={scrollRef}>
        {/* key: remonta el contenido al aterrizar la vista nueva (fade-in + barras re-animan) */}
        <div
          className={`drawer-view${swapping ? " fade-swap" : ""}`}
          key={`${displayed.id}-${displayed.mode}`}
        >
          {shown && displayed.mode === "campaign" && (
            <CampaignPanel
              city={shown}
              headingRef={headingRef}
              onBack={onBackToOpportunity}
              onToast={onToast}
            />
          )}
          {shown && displayed.mode === "opportunity" && (
            <>
              {play && <PlayHeadline headline={play.headline} />}
              <div className="d-head">
                <div>
                  <span className="eyebrow">{`0${shown.rank} · ${shown.country}`}</span>
                  <h2 className="d-city" tabIndex={-1} ref={headingRef}>
                    {shown.name}
                  </h2>
                </div>
                <div className="d-head-right">
                  <div className="score-block">
                    <div className="big">{shown.score}</div>
                    <div className="lbl">Score</div>
                  </div>
                  <button className="d-close" type="button" onClick={onClose} aria-label="Close panel (Esc)">
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="conf-row">
                <span className="lbl">Confidence</span>
                <span className="meter">
                  <i style={{ width: `${shown.confidence}%` }} />
                </span>
                <span className="val">{shown.confidence}%</span>
              </div>

              {liveConfidence != null && (
                <ConfidenceBars confidence={liveConfidence} consensus={consensus ?? null} />
              )}

              <p className="d-rec">{shown.recommendation}</p>

              <div className="d-section">
                <span className="eyebrow">Why here</span>
                {shown.reasons.map((reason) => (
                  <div className="reason" key={reason.label}>
                    <span className={`sig${reason.impact === "+" ? " pos" : ""}`}>{reason.impact}</span>
                    <p className="txt">
                      <b>{reason.label}</b> — {reason.text} <span className="src">{reason.source}</span>
                    </p>
                  </div>
                ))}
                {/* Aditivo: evidencia resuelta por razón del contrato nuevo. */}
                {evidenceReasons?.map((r, i) => (
                  <div className="reason reason-evidence" key={`ev-reason-${i}`}>
                    <p className="txt">{r.text}</p>
                    <EvidenceLinks evidenceIds={r.evidenceIds} evidence={evidence ?? {}} />
                  </div>
                ))}
              </div>

              <div className="d-section">
                <span className="eyebrow">Signal breakdown</span>
                {METRIC_ROWS.map(([label, key]) => (
                  <div className="metric" key={key}>
                    <span className="lbl">{label}</span>
                    <span className="bar">
                      <i style={{ width: `${shown.metrics[key]}%` }} />
                    </span>
                    <span className="val mono">{shown.metrics[key]}</span>
                  </div>
                ))}
              </div>

              <div className="d-section">
                <span className="eyebrow">Evidence</span>
                {shown.evidence.map((item) => (
                  <div className="evi" key={item.title}>
                    <span className="prov">{item.provider}</span>
                    <div className="body">
                      <div className="ttl">{item.title}</div>
                      <div className="when">{item.when}</div>
                    </div>
                    <span className={`badge${item.isEstimated ? " est" : ""}`}>
                      {item.isEstimated ? "Estimated" : "Observed"}
                    </span>
                  </div>
                ))}
                <span className="badge est demo-tag">Prepared demo data</span>
                {searchMeta && (
                  <p className="search-meta mono">
                    {`Search ${searchMeta.searchId} · generated ${searchMeta.generatedAt.slice(11, 16)} UTC`}
                  </p>
                )}
              </div>

              <div className="d-section">
                <span className="eyebrow">Next relevant event</span>
                {eventFeedDown ? (
                  <p className="feed-down">
                    Event sources are unavailable in this window — no event shown rather than a stale
                    one.
                  </p>
                ) : (
                  <div className="event-card">
                    <div className="cal">
                      <div className="m">{shown.event.month}</div>
                      <div className="d">{shown.event.day}</div>
                    </div>
                    <div>
                      <div className="ttl">{shown.event.name}</div>
                      <div className="meta">{shown.event.meta}</div>
                      <div className="open">{shown.event.status}</div>
                    </div>
                  </div>
                )}
              </div>

              {importSlot}

              <div className="d-section">
                <span className="eyebrow">Against San Francisco</span>
                <div className="compare">
                  <div className="cmp-row">
                    <div className="h">Signal</div>
                    <div className="hc">{shown.name.split(" ")[0]}</div>
                    <div className="h">San Francisco</div>
                  </div>
                  <div className="cmp-row">
                    <div className="h">Opportunity score</div>
                    <div className="v win">{shown.score}</div>
                    <div className="v">{shown.comparison.baselineScore}</div>
                  </div>
                  <div className="cmp-row">
                    <div className="h">Cost / activated dev</div>
                    <div className="v win">
                      {shown.comparison.cost[0]}
                      <span className="est-star">*</span>
                    </div>
                    <div className="v">
                      {shown.comparison.cost[1]}
                      <span className="est-star">*</span>
                    </div>
                  </div>
                  <div className="cmp-row">
                    <div className="h">Sponsor saturation</div>
                    <div className="v win">{shown.comparison.saturation[0]}</div>
                    <div className="v">{shown.comparison.saturation[1]}</div>
                  </div>
                </div>
                <p className="cmp-note">
                  {shown.comparison.note}{" "}
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                    *estimated
                  </span>
                </p>
                {collabNote && <p className="cmp-note">{collabNote}</p>}
              </div>
            </>
          )}
        </div>
      </div>
      {shown && (
        <div className="drawer-cta">
          {displayed.mode === "campaign" ? (
            <>
              <button
                className="btn-primary"
                type="button"
                onClick={() => onToast("Demo — export lands with the backend")}
              >
                Export brief
              </button>
              <button className="btn-ghost" type="button" onClick={onBackToOpportunity}>
                Back to opportunity
              </button>
            </>
          ) : (
            <button className="btn-primary" type="button" onClick={onGenerateCampaign}>
              Generate campaign
              <ArrowRight size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
