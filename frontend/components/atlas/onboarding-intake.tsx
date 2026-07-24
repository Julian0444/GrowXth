"use client"

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import type { SearchRequest } from "@/lib/api/types"

// Intake inicial: el usuario cuenta qué construye, qué busca y con qué budget
// ANTES de ver una query — la búsqueda del mapa queda como refinamiento.
// Nada viene precargado: descripción vacía, objetivo sin elegir, budget vacío.
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

export function OnboardingIntake({
  onLaunch,
  // Slot del RequestBanner: un error de búsqueda devuelve al intake, y el aviso
  // (con Retry) vive dentro de la card.
  banner,
}: {
  onLaunch: (payload: IntakePayload) => void
  banner?: ReactNode
}) {
  const [description, setDescription] = useState("")
  const [objective, setObjective] = useState<SearchRequest["objective"] | null>(null)
  // Solo dígitos; se muestra formateado con separador de miles.
  const [budgetDigits, setBudgetDigits] = useState("")

  const ready = description.trim().length > 0 && objective !== null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = description.trim()
    if (!text || objective === null) return
    const amount = budgetDigits ? Number(budgetDigits) : 0
    onLaunch({
      description: text,
      objective,
      budget: amount > 0 ? { amount, currency: "USD" } : undefined,
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
          Describe your product once. We rank real San Francisco communities and events for it.
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
            placeholder="Describe your product and who it's for…"
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
          <label className="intake-label" htmlFor="intake-budget">
            Campaign budget <span className="opt">· optional</span>
          </label>
          <div className="intake-budget">
            <span aria-hidden="true">$</span>
            <input
              id="intake-budget"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={budgetDigits ? Number(budgetDigits).toLocaleString("en-US") : ""}
              onChange={(event) => setBudgetDigits(event.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="Amount in USD"
              aria-label="Campaign budget in US dollars (optional)"
            />
          </div>
          <button className="intake-go" type="submit" disabled={!ready}>
            Map my opportunities
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </form>
        {banner}
      </div>
    </div>
  )
}
