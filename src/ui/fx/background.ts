/**
 * Ambient nebula background. Drawn at very low resolution and stretched by CSS, which gives a soft
 * blur for free and keeps it cheap on phones. Big additive colour blobs drift on slow Lissajous
 * paths; `pulse()` blooms light where the player just played, so the whole sky reacts to moves.
 */
import { hexToRgb, THEMES, type ThemeName } from "../palette";

interface Blob {
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
  r: number;
  color: [number, number, number];
  target: [number, number, number];
}

interface Pulse {
  x: number;
  y: number;
  color: [number, number, number];
  t: number;
  life: number;
  strength: number;
}

const SCALE = 6;

export class Background {
  private ctx: CanvasRenderingContext2D;
  private blobs: Blob[] = [];
  private pulses: Pulse[] = [];
  private base: [number, number, number] = [3, 4, 12];
  private targetBase: [number, number, number] = [3, 4, 12];
  private t = Math.random() * 1000;
  private last = 0;
  private running = false;
  private intensity = 0;
  private targetIntensity = 0;
  private frame = 0;
  private animate = true;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.resize();
    addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => (document.hidden ? this.stop() : this.start()));
    for (let i = 0; i < 5; i++)
      this.blobs.push({
        ax: 0.25 + Math.random() * 0.3,
        ay: 0.2 + Math.random() * 0.3,
        fx: 0.017 + Math.random() * 0.03,
        fy: 0.013 + Math.random() * 0.03,
        px: Math.random() * 6.28,
        py: Math.random() * 6.28,
        r: 0.42 + Math.random() * 0.3,
        color: [20, 40, 120],
        target: [20, 40, 120],
      });
  }

  private resize(): void {
    this.canvas.width = Math.max(32, Math.ceil(innerWidth / SCALE));
    this.canvas.height = Math.max(32, Math.ceil(innerHeight / SCALE));
    if (!this.running) this.draw(0);
  }

  setTheme(name: ThemeName): void {
    const th = THEMES[name];
    this.blobs.forEach((b, i) => (b.target = hexToRgb(th.blobs[i % th.blobs.length]!)));
    this.targetBase = hexToRgb(th.base);
    if (!this.running) this.start();
  }

  /** 0..1, e.g. puzzle progress: brighter, livelier sky as you go. */
  setIntensity(x: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, x));
  }

  setAnimated(on: boolean): void {
    this.animate = on;
    if (!on) {
      // Snap colours and draw a single still frame.
      for (const b of this.blobs) b.color = [...b.target];
      this.base = [...this.targetBase];
      this.draw(0);
    } else this.start();
  }

  /** Bloom of light at a viewport position. */
  pulse(x: number, y: number, color: string, strength = 1): void {
    if (!this.animate) return;
    this.pulses.push({ x: x / SCALE, y: y / SCALE, color: hexToRgb(color), t: 0, life: 1.6 + strength * 0.8, strength });
    if (this.pulses.length > 12) this.pulses.shift();
    this.start();
  }

  start(): void {
    if (this.running || !this.animate || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      // ~30 fps is plenty for a slow sky.
      if (++this.frame % 2 === 0) this.draw(dt * 2);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  private draw(dt: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    this.t += dt * (0.6 + this.intensity * 0.9);
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 0.8);
    const k = Math.min(1, dt * 0.9);
    for (let i = 0; i < 3; i++) this.base[i] = this.base[i]! + (this.targetBase[i]! - this.base[i]!) * k;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgb(${this.base.map((v) => Math.round(v)).join(",")})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    const m = Math.max(w, h);
    const alpha = 0.22 + this.intensity * 0.16;
    for (const b of this.blobs) {
      for (let i = 0; i < 3; i++) b.color[i] = b.color[i]! + (b.target[i]! - b.color[i]!) * k;
      const x = w * (0.5 + b.ax * Math.sin(this.t * b.fx * 6.28 + b.px));
      const y = h * (0.5 + b.ay * Math.cos(this.t * b.fy * 6.28 + b.py));
      const r = m * b.r * (0.9 + 0.1 * Math.sin(this.t * 0.3 + b.px));
      this.blob(x, y, r, b.color, alpha);
    }
    for (const p of this.pulses) {
      p.t += dt;
      const f = p.t / p.life;
      if (f >= 1) continue;
      const a = (1 - f) * (1 - f) * 0.55 * Math.min(1.5, p.strength);
      this.blob(p.x, p.y, m * (0.12 + 0.55 * Math.sqrt(f)) * (0.7 + p.strength * 0.4), p.color, a);
    }
    this.pulses = this.pulses.filter((p) => p.t < p.life);
    // Vignette keeps the board area calm and the edges deep.
    ctx.globalCompositeOperation = "source-over";
    const g = ctx.createRadialGradient(w / 2, h * 0.45, m * 0.2, w / 2, h * 0.45, m * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private blob(x: number, y: number, r: number, c: [number, number, number], a: number): void {
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
    const [cr, cg, cb] = c.map((v) => Math.round(v));
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
    g.addColorStop(0.5, `rgba(${cr},${cg},${cb},${a * 0.35})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
