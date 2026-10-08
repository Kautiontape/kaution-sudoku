/**
 * Full-screen additive FX canvas: spark bursts, shockwave rings, light beams and drifting motes.
 * Glow comes from pre-rendered radial sprites drawn with "lighter" compositing (no shadowBlur),
 * so hundreds of particles stay cheap. The loop sleeps when there's nothing to draw.
 */
import type { EffectsLevel } from "../settings";
import { hexToRgb } from "../palette";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  sprite: HTMLCanvasElement;
  drag: number;
  gravity: number;
  spin?: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Mote {
  x: number;
  y: number;
  vy: number;
  phase: number;
  size: number;
  sprite: HTMLCanvasElement;
}

export interface BurstOptions {
  count?: number;
  speed?: number;
  size?: number;
  life?: number;
  gravity?: number;
  spread?: number;
  /** Direction in radians (with spread) — default: all directions. */
  angle?: number;
}

const MAX_PARTICLES = 900;

export class Fx {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private beams: Beam[] = [];
  private motes: Mote[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private running = false;
  private last = 0;
  private level: EffectsLevel = "normal";
  private moteColors = ["#7cf3ff", "#a98bff"];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.start();
    });
  }

  private resize(): void {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(innerWidth * this.dpr);
    this.canvas.height = Math.round(innerHeight * this.dpr);
    this.seedMotes();
  }

  setLevel(level: EffectsLevel): void {
    this.level = level;
    this.seedMotes();
    this.start();
  }

  setMoteColors(colors: string[]): void {
    this.moteColors = colors;
    this.seedMotes();
  }

  private get scale(): number {
    return this.level === "low" ? 0.35 : this.level === "epic" ? 1.5 : 1;
  }

  private seedMotes(): void {
    const n = this.level === "epic" ? 46 : this.level === "normal" ? 22 : 0;
    this.motes = Array.from({ length: n }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vy: -(4 + Math.random() * 10),
      phase: Math.random() * 6.28,
      size: 3 + Math.random() * 5,
      sprite: this.sprite(this.moteColors[Math.floor(Math.random() * this.moteColors.length)]!),
    }));
    if (n) this.start();
  }

  /** Radial glow sprite for a colour, cached. */
  private sprite(color: string): HTMLCanvasElement {
    let s = this.sprites.get(color);
    if (s) return s;
    s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d")!;
    const [r, gg, b] = hexToRgb(color);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, `rgba(${r},${gg},${b},0.95)`);
    grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.35)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.sprites.set(color, s);
    return s;
  }

  burst(x: number, y: number, color: string, o: BurstOptions = {}): void {
    const count = Math.round((o.count ?? 18) * this.scale);
    const sprite = this.sprite(color);
    const white = this.sprite("#ffffff");
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 220) * (0.35 + Math.random() * 0.75);
      const life = (o.life ?? 0.9) * (0.6 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: (o.size ?? 9) * (0.5 + Math.random() * 0.9),
        sprite: Math.random() < 0.15 ? white : sprite,
        drag: 2.6,
        gravity: o.gravity ?? 60,
      });
    }
    this.start();
  }

  ring(x: number, y: number, color: string, r1 = 70, life = 0.7, width = 3): void {
    if (this.level === "low" && this.rings.length > 2) return;
    this.rings.push({ x, y, r0: 4, r1: r1 * (this.level === "epic" ? 1.25 : 1), life, max: life, color, width });
    this.start();
  }

  beam(x1: number, y1: number, x2: number, y2: number, color: string, width = 26, life = 0.8): void {
    this.beams.push({ x1, y1, x2, y2, life, max: life, color, width });
    this.start();
  }

  /** Sparks scattered along a segment (house sweeps). */
  streak(x1: number, y1: number, x2: number, y2: number, color: string, count = 26): void {
    const n = Math.round(count * this.scale);
    const sprite = this.sprite(color);
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const f = Math.random();
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      const life = 0.6 + Math.random() * 0.7;
      this.particles.push({
        x: x1 + (x2 - x1) * f,
        y: y1 + (y2 - y1) * f,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life,
        max: life,
        size: 6 + Math.random() * 8,
        sprite,
        drag: 1.8,
        gravity: -20,
      });
    }
    this.start();
  }

  /** Big celebratory fireworks from several points. */
  fireworks(points: { x: number; y: number; color: string }[]): void {
    points.forEach((p, i) =>
      setTimeout(() => {
        this.burst(p.x, p.y, p.color, { count: 40, speed: 420, size: 12, life: 1.6, gravity: 140 });
        this.ring(p.x, p.y, p.color, 130, 1.0, 4);
      }, i * 110),
    );
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.beams = [];
  }

  start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      // Only slow motes moving: half frame rate is indistinguishable and saves battery.
      const ambientOnly = !this.particles.length && !this.rings.length && !this.beams.length;
      if (!ambientOnly || ++frame % 2 === 0) this.draw();
      const idle = ambientOnly && !this.motes.length;
      if (idle || document.hidden) {
        this.running = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private step(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    for (const m of this.motes) {
      m.y += m.vy * dt;
      m.phase += dt * 0.8;
      m.x += Math.sin(m.phase) * 6 * dt;
      if (m.y < -20) {
        m.y = innerHeight + 20;
        m.x = Math.random() * innerWidth;
      }
    }
  }

  private draw(): void {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter";

    for (const m of this.motes) {
      const tw = 0.25 + 0.2 * Math.sin(m.phase * 2.3);
      ctx.globalAlpha = tw;
      ctx.drawImage(m.sprite, m.x - m.size, m.y - m.size, m.size * 2, m.size * 2);
    }

    for (const b of this.beams) {
      const f = b.life / b.max;
      const [r, g, bl] = hexToRgb(b.color);
      ctx.lineCap = "round";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(${r},${g},${bl},${0.18 * f})`;
      ctx.lineWidth = b.width * (1.6 - 0.6 * f);
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${r},${g},${bl},${0.45 * f})`;
      ctx.lineWidth = b.width * 0.45;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * f * f})`;
      ctx.lineWidth = Math.max(1.5, b.width * 0.1);
      ctx.stroke();
    }

    for (const r of this.rings) {
      const f = 1 - r.life / r.max;
      const radius = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - f, 3));
      const [cr, cg, cb] = hexToRgb(r.color);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(1 - f) * 0.9})`;
      ctx.lineWidth = r.width * (1 - f) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(1 - f) * 0.25})`;
      ctx.lineWidth = r.width * 4 * (1 - f) + 1;
      ctx.stroke();
    }

    for (const p of this.particles) {
      const f = p.life / p.max;
      ctx.globalAlpha = Math.min(1, f * 1.6);
      const s = p.size * (0.4 + 0.6 * f);
      ctx.drawImage(p.sprite, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
