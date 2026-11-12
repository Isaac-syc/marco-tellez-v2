/**
 * Motion utilities: springs, momentum projection, rubber banding, velocity
 * tracking. No dependencies. Everything here is framework-agnostic.
 *
 * Springs are described the way Apple's "Designing Fluid Interfaces" does it,
 * with two designer-friendly parameters instead of mass / stiffness / damping:
 *
 *  - `damping`  (damping ratio): 1 = critically damped, no overshoot;
 *                < 1 overshoots and oscillates.
 *  - `response` (seconds): how quickly the value approaches the target. It is
 *                NOT a duration; the settle time emerges from the physics.
 *
 * With unit mass:  stiffness k = (2π / response)²,  damping c = 4π · damping / response.
 */

export interface SpringOptions {
  from: number;
  to: number;
  /** Initial velocity in units per second (e.g. the finger's release velocity). */
  velocity?: number;
  /** Damping ratio. Default 1 (no bounce). */
  damping?: number;
  /** Response in seconds. Default 0.35. */
  response?: number;
  /** Settle when |value − to| is below this. Default 0.01 (≈ sub-pixel). */
  restDelta?: number;
  /** …and |velocity| is below this (units/s). Default 0.05. */
  restSpeed?: number;
  onUpdate: (value: number, velocity: number) => void;
  /** Called once when the spring settles on `to` (never after `cancel()`). */
  onComplete?: () => void;
}

export interface SpringState {
  value: number;
  velocity: number;
}

export interface SpringHandle {
  /** Latest value / velocity (live while running). */
  readonly value: number;
  readonly velocity: number;
  readonly active: boolean;
  /**
   * Stops the spring and returns where it was and how fast it was going, so a
   * new animation (or a drag) can start from the on-screen presentation value
   * instead of the logical target. `onComplete` is NOT called.
   */
  cancel(): SpringState;
}

/** Fixed integration step (seconds). 1/240 keeps the semi-implicit Euler accurate for response ≥ 0.1. */
const STEP = 1 / 240;
/** Longest frame we simulate in one go (tab switches, long tasks). */
const MAX_FRAME = 1 / 20;

interface Running {
  o: Required<Omit<SpringOptions, 'onComplete'>> & Pick<SpringOptions, 'onComplete'>;
  h: Mutable;
  k: number;
  c: number;
}
interface Mutable extends SpringHandle {
  value: number;
  velocity: number;
  active: boolean;
}

const running = new Set<Running>();
let raf = 0;
let last = 0;

function tick(now: number): void {
  const frame = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  for (const s of [...running]) {
    const { o, h, k, c } = s;
    let x = h.value;
    let v = h.velocity;
    for (let t = frame; t > 0; t -= STEP) {
      const dt = Math.min(STEP, t);
      // Semi-implicit Euler: update velocity first, then position.
      v += (-k * (x - o.to) - c * v) * dt;
      x += v * dt;
    }
    h.value = x;
    h.velocity = v;
    if (Math.abs(x - o.to) < o.restDelta && Math.abs(v) < o.restSpeed) {
      h.value = o.to;
      h.velocity = 0;
      h.active = false;
      running.delete(s);
      o.onUpdate(o.to, 0);
      o.onComplete?.();
    } else {
      o.onUpdate(x, v);
    }
  }
  raf = running.size ? requestAnimationFrame(tick) : 0;
}

/**
 * Starts a spring. One shared requestAnimationFrame loop drives all springs.
 * Cancellable, velocity-aware, and safe to start from a cancelled spring's state.
 */
export function spring(options: SpringOptions): SpringHandle {
  const response = Math.max(options.response ?? 0.35, 0.05);
  const damping = options.damping ?? 1;
  const h: Mutable = {
    value: options.from,
    velocity: options.velocity ?? 0,
    active: true,
    cancel() {
      if (h.active) {
        h.active = false;
        running.delete(entry);
      }
      return { value: h.value, velocity: h.velocity };
    },
  };
  const w = (2 * Math.PI) / response;
  const entry: Running = {
    o: {
      from: options.from,
      to: options.to,
      velocity: options.velocity ?? 0,
      damping,
      response,
      restDelta: options.restDelta ?? 0.01,
      restSpeed: options.restSpeed ?? 0.05,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
    },
    h,
    k: w * w,
    c: 2 * damping * w,
  };
  running.add(entry);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  return h;
}

export interface AnimateOptions {
  damping?: number;
  response?: number;
  /** Initial velocity (units/s). Defaults to the value's current velocity. */
  velocity?: number;
  restDelta?: number;
  restSpeed?: number;
}

/**
 * A number that can be set, dragged, or spring-animated, and that always
 * animates *from its current presentation value* with its current velocity.
 * Interrupting an `animateTo` with another `animateTo` (or `set`) never jumps.
 * Two-dimensional motion is modelled as independent X and Y values.
 */
export class SpringValue {
  private handle: SpringHandle | null = null;
  private resolve: ((completed: boolean) => void) | null = null;
  private v = 0;

  constructor(
    private x: number,
    private readonly onChange: (value: number) => void,
    private readonly precision: { restDelta?: number; restSpeed?: number } = {},
  ) {}

  get value(): number {
    return this.handle ? this.handle.value : this.x;
  }
  get velocity(): number {
    return this.handle ? this.handle.velocity : this.v;
  }
  get animating(): boolean {
    return !!this.handle;
  }

  /** Stops any animation where it is (value and velocity are kept). */
  stop(): void {
    if (!this.handle) return;
    const s = this.handle.cancel();
    this.x = s.value;
    this.v = s.velocity;
    this.handle = null;
    this.resolve?.(false);
    this.resolve = null;
  }

  /** Jumps to `value` immediately (cancels any animation, zero velocity). */
  set(value: number): void {
    this.stop();
    this.x = value;
    this.v = 0;
    this.onChange(value);
  }

  /** Resolves `true` when settled on `to`, `false` if interrupted first. */
  animateTo(to: number, opts: AnimateOptions = {}): Promise<boolean> {
    const from = this.value;
    const velocity = opts.velocity ?? this.velocity;
    this.stop();
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
      this.handle = spring({
        from,
        to,
        velocity,
        damping: opts.damping,
        response: opts.response,
        restDelta: opts.restDelta ?? this.precision.restDelta,
        restSpeed: opts.restSpeed ?? this.precision.restSpeed,
        onUpdate: (value) => {
          this.x = value;
          this.onChange(value);
        },
        onComplete: () => {
          this.x = to;
          this.v = 0;
          this.handle = null;
          this.resolve = null;
          resolve(true);
        },
      });
    });
  }
}

/**
 * Where a flick would come to rest, using Apple's exponential-decay projection
 * (not v²/2a). `velocity` in px/s; returns a distance in px.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Progressive resistance past a boundary: the further you pull, the less the
 * content follows. Returns the *displayed* overshoot for a *raw* overshoot.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Keeps a short history of pointer samples and reports the release velocity
 * (px/s) over the last ~100 ms, which is what momentum and spring hand-off need.
 */
export class VelocityTracker {
  private samples: { t: number; x: number; y: number }[] = [];

  reset(): void {
    this.samples.length = 0;
  }

  add(x: number, y: number, t = performance.now()): void {
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > 100) this.samples.shift();
  }

  /** Velocity in px/s; zero if the pointer was still for a while before release. */
  velocity(now = performance.now()): { x: number; y: number } {
    const s = this.samples;
    if (s.length < 2 || now - s[s.length - 1].t > 80) return { x: 0, y: 0 };
    const a = s[0];
    const b = s[s.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return { x: 0, y: 0 };
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
