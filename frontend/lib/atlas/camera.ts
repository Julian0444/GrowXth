// Cámara del atlas (§6) — trabaja en unidades del canvas 980×560, igual que el
// prototipo canónico: el offset en px de pantalla se convierte con S = max(vw/980, vh/560).

import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/atlas/signal-layout"

export const MIN_ZOOM = 1
export const MAX_ZOOM = 9
export const ZOOM_STEP = 1.55

export type CameraFrame = {
  x: number
  y: number
  k: number
  offX: number
  offY: number
}

// Encuadres verificados del prototipo (§6).
export const FRAME_IDLE: CameraFrame = { x: 490, y: 258, k: 1.02, offX: 0, offY: 0 }
export const FRAME_RESULTS: CameraFrame = { x: 470, y: 342, k: 1.3, offX: 0, offY: 0 }

// SELECTED: la ciudad queda centrada en el espacio libre a la izquierda del panel
// (desktop offset +200px); en mobile, centrada en la franja visible entre los
// chips y el sheet de 46svh. (El prototipo usaba −0.17vh, que dejaba la ciudad
// DETRÁS del sheet — desviación deliberada del Bloque 5, anotada en el handoff.)
export function cityFrame(x: number, y: number, viewportWidth: number, viewportHeight: number): CameraFrame {
  return viewportWidth <= 760
    ? { x, y, k: 3.0, offX: 0, offY: 0.1 * viewportHeight }
    : { x, y, k: 3.1, offX: 200, offY: -14 }
}

export function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
}

export function coverScale(viewportWidth: number, viewportHeight: number): number {
  return Math.max(viewportWidth / MAP_WIDTH, viewportHeight / MAP_HEIGHT)
}

// Misma curva que el CSS (--ease) para animar por rAF.
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a
  const B = (a: number, b: number) => 3 * b - 6 * a
  const C = (a: number) => 3 * a
  const cx = (t: number) => ((A(x1, x2) * t + B(x1, x2)) * t + C(x1)) * t
  const cy = (t: number) => ((A(y1, y2) * t + B(y1, y2)) * t + C(y1)) * t
  const dx = (t: number) => 3 * A(x1, x2) * t * t + 2 * B(x1, x2) * t + C(x1)
  return (x: number) => {
    let t = x
    for (let i = 0; i < 5; i += 1) {
      const d = dx(t)
      if (!d) break
      t -= (cx(t) - x) / d
    }
    return cy(Math.max(0, Math.min(1, t)))
  }
}

export const easeCam = bezier(0.22, 1, 0.36, 1)
