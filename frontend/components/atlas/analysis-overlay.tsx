"use client"

import { SEARCH_STAGES } from "@/lib/api/demo-adapter"

// Pasos §5 guiados por el stage REAL del request (RequestState.loading.stage):
// el overlay no tiene timers propios — nunca porcentajes inventados.
// stageIndex: índice del paso en curso; SEARCH_STAGES.length = todos completos
// (fade-out tras éxito); -1 = ninguno resaltado (fade-out tras error).
export function AnalysisOverlay({ active, stageIndex }: { active: boolean; stageIndex: number }) {
  return (
    <div className="analysis" aria-live="polite">
      <div className="analysis-box">
        <span className="eyebrow">Analyzing</span>
        {SEARCH_STAGES.map((stage, index) => (
          <div
            key={stage.id}
            className={`a-step${active && index === stageIndex ? " now" : ""}${index < stageIndex ? " done" : ""}`}
          >
            <span className="tick" />
            {stage.label}
          </div>
        ))}
      </div>
    </div>
  )
}
