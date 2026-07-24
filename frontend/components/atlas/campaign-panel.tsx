"use client"

import type { RefObject } from "react"
import { ArrowLeft, Copy } from "lucide-react"
import { DEMO_CITIES, type DemoCity } from "@/lib/demo/fixtures"

// El prototipo normaliza el funnel al máximo global del dataset (240), no al de
// cada ciudad — los funnels de BA/SP se ven proporcionalmente menores que Bangalore.
const FUNNEL_MAX = Math.max(
  ...Object.values(DEMO_CITIES).flatMap((city) => city.campaign.funnel.map(([, value]) => value)),
)

function formatAmount(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`
}

// Vista de campaña (§9) — vive dentro del mismo .drawer-view que la oportunidad;
// el crossfade y el foco los maneja OpportunityDrawer.
export function CampaignPanel({
  city,
  headingRef,
  onBack,
  onToast,
}: {
  city: DemoCity
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onToast: (message: string) => void
}) {
  const campaign = city.campaign
  const total = campaign.budget.reduce((sum, [, amount]) => sum + amount, 0)

  const copyOutreach = () => {
    navigator.clipboard?.writeText(campaign.outreach)
    onToast("Message copied")
  }

  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={12} strokeWidth={2} />
        Back to opportunity
      </button>{" "}
      <span className="eyebrow">{`Campaign · ${city.name}`}</span>
      <h2 className="camp-title" tabIndex={-1} ref={headingRef}>
        {campaign.title}
      </h2>
      <p className="camp-sub">{campaign.sub}</p>

      <div className="d-section">
        <span className="eyebrow">Recommended play</span>
        <div className="kv">
          <span className="k">Track</span>
          <span className="v">{campaign.track}</span>
        </div>
        <div className="kv">
          <span className="k">Prize</span>
          <span className="v">{campaign.prize}</span>
        </div>
        <div className="kv">
          <span className="k">Workshop</span>
          <span className="v">{campaign.workshop}</span>
        </div>
      </div>

      <div className="d-section">
        <span className="eyebrow">{`Budget · ${formatAmount(total)}`}</span>
        {campaign.budget.map(([label, amount]) => (
          <div className="budget-row" key={label}>
            <span>{label}</span>
            <span className="amt">{formatAmount(amount)}</span>
          </div>
        ))}
        <div className="budget-row total">
          <span>Total</span>
          <span className="amt">{formatAmount(total)}</span>
        </div>
      </div>

      <div className="d-section">
        <span className="eyebrow">Organizer outreach</span>
        <div className="outreach">
          {`“${campaign.outreach}”`}
          <button className="copy-btn" type="button" onClick={copyOutreach}>
            Copy
          </button>
        </div>
      </div>

      <div className="d-section">
        <span className="eyebrow">Measurement plan · projected example</span>
        {campaign.funnel.map(([label, value]) => (
          <div className="funnel-step" key={label}>
            <span className="lbl">{label}</span>
            <span className="bar">
              <i style={{ width: `${(value / FUNNEL_MAX) * 100}%` }} />
            </span>
            <span className="val mono">{value}</span>
          </div>
        ))}
        {/* Métrica North Star del producto — siempre visible al cierre del funnel. */}
        <div className="funnel-final">
          <span className="lbl">Cost per retained developer</span>
          <span className="val">{campaign.costPerRetained}</span>
        </div>
      </div>

      <div className="d-section">
        <span className="eyebrow">Attribution</span>
        <div className="attr-chip">
          {campaign.attributionCode}
          <Copy size={11} strokeWidth={1.8} />
        </div>
        <p className="cmp-note">
          Dedicated API-key cohort + event code so post-event activation and retention attribute
          back to this decision.
        </p>
      </div>
    </>
  )
}
