"use client"

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import type { SearchRequest } from "@/lib/api/types"
import { DEMO_QUERY } from "@/lib/demo/fixtures"

// Intake inicial: el usuario cuenta qué construye, qué busca y con qué budget
// ANTES de ver una query — la búsqueda del mapa queda como refinamiento.
export type IntakePayload = {
  description: string
  objective: SearchRequest["objective"]
  budget?: SearchRequest["budget"]
}

const OBJECTIVES: { id: SearchRequest["objective"]; label: string }[] = [
  { id: "adoption", label: "Developer adoption" },
  { id: "feedback", label: "Technical feedback" },
  { id: "talent", label: "Hiring & talent" },
  { id: "awareness", label: "Brand awareness" },
]

const BUDGETS: { amount: number | null; label: string }[] = [
  { amount: null, label: "Not set" },
  { amount: 5000, label: "$5K" },
  { amount: 20000, label: "$20K" },
  { amount: 50000, label: "$50K" },
]

const EXAMPLES: { label: string; description: string; objective: SearchRequest["objective"]; budget: number | null }[] = [
  { label: "Agent observability", description: DEMO_QUERY, objective: "adoption", budget: 20000 },
  { label: "Vector database", description: "Vector database for production RAG", objective: "feedback", budget: null },
]

export function OnboardingIntake({
  onLaunch,
  // Slot del RequestBanner: un error de búsqueda devuelve al intake, y el aviso
  // (con Retry / Use prepared demo) vive dentro de la card.
  banner,
}: {
  onLaunch: (payload: IntakePayload) => void
  banner?: ReactNode
}) {
  const [description, setDescription] = useState("")
  const [objective, setObjective] = useState<SearchRequest["objective"]>("adoption")
  const [budget, setBudget] = useState<number | null>(20000)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = description.trim() || DEMO_QUERY
    setDescription(text)
    onLaunch({
      description: text,
      objective,
      budget: budget !== null ? { amount: budget, currency: "USD" } : undefined,
    })
  }

  const onFieldKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="intake">
      <div className="intake-card">
        <span className="eyebrow">Growth Atlas</span>
        <h2 className="intake-title">Where should you grow next?</h2>
        <p className="intake-sub">
          Tell us about your product once — every market we surface on the map is ranked for it.
        </p>
        <form onSubmit={submit}>
          <label className="intake-label" htmlFor="intake-description">
            What does your company build?
          </label>
          <textarea
            id="intake-description"
            className="intake-field"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={onFieldKeyDown}
            placeholder="e.g. We build an observability platform for AI agents."
            autoComplete="off"
          />
          <span className="intake-label" id="intake-objective-label">
            What are you optimizing for?
          </span>
          <div className="intake-chips" role="group" aria-labelledby="intake-objective-label">
            {OBJECTIVES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={objective === option.id ? "on" : undefined}
                aria-pressed={objective === option.id}
                onClick={() => setObjective(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="intake-label" id="intake-budget-label">
            Campaign budget
          </span>
          <div className="intake-chips" role="group" aria-labelledby="intake-budget-label">
            {BUDGETS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={budget === option.amount ? "on" : undefined}
                aria-pressed={budget === option.amount}
                onClick={() => setBudget(option.amount)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button className="intake-go" type="submit">
            Map my opportunities
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </form>
        {banner}
        <p className="intake-examples">
          <span>Try an example:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => {
                setDescription(example.description)
                setObjective(example.objective)
                setBudget(example.budget)
              }}
            >
              {example.label}
            </button>
          ))}
        </p>
      </div>
    </div>
  )
}
