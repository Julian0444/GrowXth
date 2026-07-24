"use client"

import type { RefObject } from "react"
import { ArrowLeft, Copy } from "lucide-react"
import type { CampaignRecommendation } from "@/lib/api/types"

function formatAmount(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`
}

// Vista de campaña (§9) — vive dentro del mismo .drawer-view que la oportunidad;
// el crossfade y el foco los maneja OpportunityDrawer. Consume el contrato
// CampaignRecommendation — la campaña llega con la Opportunity del backend.
export function CampaignPanel({
  cityName,
  campaign,
  headingRef,
  onBack,
  onToast,
}: {
  cityName: string
  campaign: CampaignRecommendation
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onToast: (message: string) => void
}) {
  const total = campaign.budgetBreakdown.reduce((sum, item) => sum + item.amount, 0)
  // El funnel se normaliza al primer paso (registrations = 100%).
  const funnelMax = Math.max(1, ...campaign.funnel.map((step) => step.value))

  const copyOutreach = () => {
    navigator.clipboard?.writeText(campaign.organizerMessage)
    onToast("Message copied")
  }

  return (
    <>
      <button className="back-link" type="button" onClick={onBack}>
        <ArrowLeft size={12} strokeWidth={2} />
        Back to opportunity
      </button>{" "}
      <span className="eyebrow">{`Campaign · ${cityName}`}</span>
      <h2 className="camp-title" tabIndex={-1} ref={headingRef}>
        {campaign.title}
      </h2>
      <p className="camp-sub">{campaign.subtitle}</p>

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
        {campaign.budgetBreakdown.map((item) => (
          <div className="budget-row" key={item.label}>
            <span>{item.label}</span>
            <span className="amt">{formatAmount(item.amount)}</span>
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
          {`“${campaign.organizerMessage}”`}
          <button className="copy-btn" type="button" onClick={copyOutreach}>
            Copy
          </button>
        </div>
      </div>

      <div className="d-section">
        <span className="eyebrow">Measurement plan · projected example</span>
        {campaign.funnel.map((step) => (
          <div className="funnel-step" key={step.label}>
            <span className="lbl">{step.label}</span>
            <span className="bar">
              <i style={{ width: `${(step.value / funnelMax) * 100}%` }} />
            </span>
            <span className="val mono">{step.value}</span>
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
