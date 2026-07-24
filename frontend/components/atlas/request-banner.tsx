"use client"

import type { RequestState } from "@/lib/api/types"

// Estados de request visibles (§10): error → mensaje pequeño y honesto con
// Retry + "Use prepared demo" (carga §11 con el mismo schema); partial → aviso
// de qué fuentes faltan. La presentación nunca se rompe.
export function RequestBanner({
  request,
  onRetry,
  onUsePreparedDemo,
}: {
  request: RequestState
  onRetry: () => void
  onUsePreparedDemo: () => void
}) {
  if (request.status === "error") {
    return (
      <div className="req-banner error" role="alert">
        <p className="msg">
          <b>Search failed</b> — {request.message}
        </p>
        <div className="actions">
          {request.retryable && (
            <button className="req-btn" type="button" onClick={onRetry}>
              Retry
            </button>
          )}
          <button className="req-btn solid" type="button" onClick={onUsePreparedDemo}>
            Use prepared demo
          </button>
        </div>
      </div>
    )
  }
  if (request.status === "partial") {
    return (
      <div className="req-banner partial" role="status">
        <p className="msg">{request.message}</p>
      </div>
    )
  }
  return null
}
