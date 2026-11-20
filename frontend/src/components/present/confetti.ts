/** A small canvas confetti engine for the presentation stage (1920×1080 stage coordinates). */
import { reducedMotion } from '../../motion'

interface Particle {
  x: number; y: number; vx: number; vy: number
  rot: number; vr: number; w: number; h: number
  color: string; life: number; ttl: number
  wob: number; vw: number; shape: 0 | 1 | 2
}

export interface BurstOptions {
  x: number
  y: number
  colors: string[]
  count?: number
  /** Cone width in degrees. */
  spread?: number
  /** Direction in degrees; -90 is straight up. */
  angle?: number
  speed?: number
}

const MAX = 1400

export class Confetti {
  private ps: Particle[] = []
  private raf = 0
  private ctx: CanvasRenderingContext2D | null
  private rainUntil = 0
  private rainColors: string[] = []
  private rainRate = 5

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')
  }

  burst(o: BurstOptions) {
    if (reducedMotion()) return
    const n = o.count ?? 120
    const spread = ((o.spread ?? 70) * Math.PI) / 180
    const base = ((o.angle ?? -90) * Math.PI) / 180
    const speed = o.speed ?? 18
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * spread
      const v = speed * (0.45 + Math.random() * 0.8)
      this.add(o.x, o.y, Math.cos(a) * v, Math.sin(a) * v, o.colors)
    }
    this.loop()
  }

  /** Confetti falling from the top edge for `ms`. */
  rain(ms: number, colors: string[], rate = 5) {
    if (reducedMotion()) return
    this.rainUntil = performance.now() + ms
    this.rainColors = colors
    this.rainRate = rate
    this.loop()
  }

  stopRain() { this.rainUntil = 0 }

  clear() {
    this.ps = []
    this.rainUntil = 0
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.clear()
  }

  private add(x: number, y: number, vx: number, vy: number, colors: string[]) {
    if (this.ps.length >= MAX) this.ps.shift()
    this.ps.push({
      x, y, vx, vy,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      w: 10 + Math.random() * 12,
      h: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0,
      ttl: 240 + Math.random() * 180,
      wob: Math.random() * 10,
      vw: 0.05 + Math.random() * 0.12,
      shape: Math.floor(Math.random() * 3) as 0 | 1 | 2
    })
  }

  private loop() {
    if (this.raf) return
    const tick = () => {
      this.raf = 0
      this.step()
      if (this.ps.length || performance.now() < this.rainUntil) this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private step() {
    const ctx = this.ctx
    if (!ctx) return
    const { width, height } = this.canvas
    if (performance.now() < this.rainUntil) {
      for (let i = 0; i < this.rainRate; i++) {
        this.add(Math.random() * width, -20, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, this.rainColors)
      }
    }
    ctx.clearRect(0, 0, width, height)
    const alive: Particle[] = []
    for (const p of this.ps) {
      p.vx *= 0.985
      p.vy = p.vy * 0.985 + 0.32
      p.wob += p.vw
      p.x += p.vx + Math.sin(p.wob) * 0.9
      p.y += p.vy
      p.rot += p.vr
      p.life++
      if (p.y > height + 40 || p.life > p.ttl) continue
      alive.push(p)
      const fade = p.life > p.ttl - 40 ? (p.ttl - p.life) / 40 : 1
      ctx.save()
      ctx.globalAlpha = Math.max(0, fade)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === 1) {
        ctx.beginPath()
        ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.shape === 2) {
        ctx.fillRect(-p.w * 0.8, -1.5, p.w * 1.6, 3)
      } else {
        ctx.scale(1, Math.cos(p.wob))
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      }
      ctx.restore()
    }
    this.ps = alive
  }
}
