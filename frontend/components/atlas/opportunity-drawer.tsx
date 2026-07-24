"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRight, X } from "lucide-react"
import type { MarketComparison, Opportunity, OpportunityMetrics, SourceReference } from "@/lib/api/types"
import { CampaignPanel } from "./campaign-panel"

// Línea de auditoría del response (§10): searchId + generatedAt reales.
export type SearchMeta = { searchId: string; generatedAt: string }

// La vista de campaña (§9) comparte el nodo del drawer con la de oportunidad;
// el cambio entre ambas usa el mismo crossfade que ciudad→ciudad.
type DrawerMode = "opportunity" | "campaign"

const METRIC_ROWS: [string, keyof OpportunityMetrics][] = [
  ["Demand", "demand"],
  ["Developer fit", "developerFit"],
  ["Event momentum", "eventMomentum"],
  ["Cost efficiency", "costEfficiency"],
  ["Competition gap", "competitionGap"],
]

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const IMPACT_GLYPH: Record<string, string> = { positive: "+", negative: "−", neutral: "·" }

const SATURATION_LABEL: Record<MarketComparison["sponsorSaturation"]["market"], string> = {
  very_low: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
}

export function rankLabel(rank: number): string {
  return String(rank).padStart(2, "0")
}

// Fecha calendario LITERAL del ISO (sin convertir zona horaria).
function literalDate(iso: string): { month: string; day: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  return { month: MONTHS[Number(match[2]) - 1] ?? "—", day: String(Number(match[3])) }
}

function formatEvidenceWhen(source: SourceReference): string {
  if (source.isEstimated) return "estimated"
  const match = /^(\d{4})-(\d{2})/.exec(source.observedAt)
  return match ? `observed ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "observed"
}

function formatCost(cost: { amount: number } | null): string {
  return cost ? `$${cost.amount}` : "—"
}

export function OpportunityDrawer({
  opportunity,
  open,
  campaign,
  sheetTall,
  onToggleSheet,
  searchMeta,
  eventFeedDown,
  importSlot,
  onClose,
  onGenerateCampaign,
  onBackToOpportunity,
  onToast,
}: {
  // Contrato §10: el drawer consume Opportunity directamente — cualquier mercado
  // que devuelva el backend se renderiza sin tocar este componente.
  opportunity: Opportunity | null
  open: boolean
  campaign: boolean
  // Bottom sheet mobile (§12): el grabber alterna medium (46svh) ↔ tall (88svh).
  sheetTall: boolean
  onToggleSheet: () => void
  searchMeta: SearchMeta | null
  // dataCoverage §10: con las fuentes de eventos caídas se dice, no se muestra
  // un evento potencialmente viejo.
  eventFeedDown: boolean
  importSlot: ReactNode
  onClose: () => void
  onGenerateCampaign: () => void
  onBackToOpportunity: () => void
  onToast: (message: string) => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const targetMode: DrawerMode = campaign ? "campaign" : "opportunity"
  const targetId = opportunity?.id ?? null

  // Ciudad→ciudad y oportunidad↔campaña sin desmontar el panel (§6/§9): el contenido
  // mostrado va detrás del objetivo — 160ms de salida (.fade-swap) y remonte con fade-in.
  const [displayed, setDisplayed] = useState<{
    id: string | null
    opportunity: Opportunity | null
    mode: DrawerMode
  }>({ id: targetId, opportunity, mode: targetMode })
  const swapping =
    open &&
    displayed.id !== null &&
    targetId !== null &&
    (displayed.id !== targetId || displayed.mode !== targetMode)

  useEffect(() => {
    if (displayed.id === targetId && displayed.opportunity === opportunity && displayed.mode === targetMode) return
    // Con el panel cerrado (o primera apertura) se sincroniza sin crossfade.
    const delay = open && displayed.id !== null && targetId !== null ? 160 : 0
    const timer = window.setTimeout(
      () => setDisplayed({ id: targetId, opportunity, mode: targetMode }),
      delay,
    )
    return () => window.clearTimeout(timer)
  }, [open, targetId, opportunity, targetMode, displayed])

  useEffect(() => {
    if (!open || !displayed.id) return
    scrollRef.current?.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [open, displayed.id, displayed.mode])

  const shown = displayed.opportunity
  const nextEvent = shown?.events[0] ?? null
  const eventDate = nextEvent ? literalDate(nextEvent.startsAt) : null
  const comparison = shown?.comparison ?? null

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
          {shown && displayed.mode === "campaign" && shown.campaign && (
            <CampaignPanel
              cityName={shown.city}
              campaign={shown.campaign}
              headingRef={headingRef}
              onBack={onBackToOpportunity}
              onToast={onToast}
            />
          )}
          {shown && displayed.mode === "opportunity" && (
            <>
              <div className="d-head">
                <div>
                  <span className="eyebrow">{`${rankLabel(shown.rank)} · ${shown.country}`}</span>
                  <h2 className="d-city" tabIndex={-1} ref={headingRef}>
                    {shown.city}
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

              <p className="d-rec">{shown.recommendation}</p>

              <div className="d-section">
                <span className="eyebrow">Why here</span>
                {shown.reasons.map((reason) => (
                  <div className="reason" key={reason.id}>
                    <span className={`sig${reason.impact === "positive" ? " pos" : ""}`}>
                      {IMPACT_GLYPH[reason.impact] ?? "·"}
                    </span>
                    <p className="txt">
                      <b>{reason.label}</b> — {reason.explanation}{" "}
                      {reason.sourceLabel && <span className="src">{reason.sourceLabel}</span>}
                    </p>
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

              {shown.evidence.length > 0 && (
                <div className="d-section">
                  <span className="eyebrow">Evidence</span>
                  {shown.evidence.map((item) => (
                    <div className="evi" key={item.id}>
                      <span className="prov">{item.provider}</span>
                      <div className="body">
                        <div className="ttl">{item.title}</div>
                        <div className="when">{formatEvidenceWhen(item)}</div>
                      </div>
                      <span className={`badge${item.isEstimated ? " est" : ""}`}>
                        {item.isEstimated ? "Estimated" : "Observed"}
                      </span>
                    </div>
                  ))}
                  {searchMeta && (
                    <p className="search-meta mono">
                      {`Search ${searchMeta.searchId} · generated ${searchMeta.generatedAt.slice(11, 16)} UTC`}
                    </p>
                  )}
                </div>
              )}

              {(eventFeedDown || nextEvent) && (
                <div className="d-section">
                  <span className="eyebrow">Next relevant event</span>
                  {eventFeedDown ? (
                    <p className="feed-down">
                      Event sources are unavailable in this window — no event shown rather than a stale
                      one.
                    </p>
                  ) : (
                    nextEvent && (
                      <div className="event-card">
                        <div className="cal">
                          <div className="m">{eventDate?.month ?? "—"}</div>
                          <div className="d">{eventDate?.day ?? "—"}</div>
                        </div>
                        <div>
                          <div className="ttl">{nextEvent.name}</div>
                          <div className="meta">
                            {[nextEvent.organizer, nextEvent.venue].filter(Boolean).join(" · ")}
                          </div>
                          {nextEvent.registrationStatus && (
                            <div className="open">{nextEvent.registrationStatus}</div>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {importSlot}

              {comparison && (
                <div className="d-section">
                  <span className="eyebrow">{`Against ${comparison.baselineCity}`}</span>
                  <div className="compare">
                    <div className="cmp-row">
                      <div className="h">Signal</div>
                      <div className="hc">{shown.city.split(" ")[0]}</div>
                      <div className="h">{comparison.baselineCity}</div>
                    </div>
                    <div className="cmp-row">
                      <div className="h">Opportunity score</div>
                      <div className="v win">{shown.score}</div>
                      <div className="v">{comparison.baselineScore}</div>
                    </div>
                    <div className="cmp-row">
                      <div className="h">Cost / activated dev</div>
                      <div className="v win">
                        {formatCost(comparison.costPerActivatedDev.market)}
                        {comparison.costPerActivatedDev.isEstimated && <span className="est-star">*</span>}
                      </div>
                      <div className="v">
                        {formatCost(comparison.costPerActivatedDev.baseline)}
                        {comparison.costPerActivatedDev.isEstimated && <span className="est-star">*</span>}
                      </div>
                    </div>
                    <div className="cmp-row">
                      <div className="h">Sponsor saturation</div>
                      <div className="v win">{SATURATION_LABEL[comparison.sponsorSaturation.market]}</div>
                      <div className="v">{SATURATION_LABEL[comparison.sponsorSaturation.baseline]}</div>
                    </div>
                  </div>
                  <p className="cmp-note">
                    {comparison.note}{" "}
                    {comparison.costPerActivatedDev.isEstimated && (
                      <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                        *estimated
                      </span>
                    )}
                  </p>
                </div>
              )}
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
            shown.campaign && (
              <button className="btn-primary" type="button" onClick={onGenerateCampaign}>
                Generate campaign
                <ArrowRight size={13} strokeWidth={2} />
              </button>
            )
          )}
        </div>
      )}
    </aside>
  )
}
