"use client"

import type { FormEvent, ReactNode, RefObject } from "react"
import { Search } from "lucide-react"
import { DEMO_QUERY } from "@/lib/demo/fixtures"

const PRESETS = [
  { label: "Agent observability · $20K", query: DEMO_QUERY },
  { label: "Fine-tuning API", query: "Fine-tuning API for open models" },
  { label: "Vector database", query: "Vector database for production RAG" },
]

// Chips de interpretación (§5, máximo 3) — vienen de la respuesta real
// (SearchResponse.interpretation + budget del request), no de un hardcode.
export type InterpretationChips = { product: string; objective: string; budget: string }

export function SearchCommand({
  value,
  onValueChange,
  onSearch,
  chips,
  inputRef,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  onSearch: (query: string) => void
  chips: InterpretationChips | null
  inputRef: RefObject<HTMLInputElement | null>
  // Slot para el banner de request (§10): vive bajo la search para heredar su
  // posición idle/compacta.
  children?: ReactNode
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const query = value.trim() || DEMO_QUERY
    onValueChange(query)
    onSearch(query)
  }

  return (
    <div className="atlas-search">
      <form className="search-card" onSubmit={submit}>
        <div className="search-row">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" />
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="Describe what your company builds…"
            autoComplete="off"
            aria-label="Describe what your company builds"
          />
          <button className="search-go" type="submit">
            Map opportunity
          </button>
        </div>
      </form>
      {chips && (
        <div className="chips" aria-label="Interpreted intent">
          <span className="chip">
            <span className="k">Product</span>
            <b>{chips.product}</b>
          </span>
          <span className="chip">
            <span className="k">Objective</span>
            <b>{chips.objective}</b>
          </span>
          <span className="chip">
            <span className="k">Budget</span>
            <b>{chips.budget}</b>
          </span>
        </div>
      )}
      {children}
      <p className="search-hint">We map where your next developers are emerging.</p>
      <div className="presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              onValueChange(preset.query)
              onSearch(preset.query)
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
