/**
 * Stills lightbox.
 *
 * Progressive enhancement over a plain gallery of links: without JS every photo
 * is a link to its large image. With JS, a native <dialog> opens and:
 *
 *   1. Base      — click/Enter opens; contain-fitted image on 96 % black; caption
 *                  (title, category, n / total across the WHOLE gallery); visible
 *                  Previous / Next / Close buttons; ← → Esc; focus trapped and
 *                  restored; neighbours preloaded; AVIF/WebP srcset (1600/2400).
 *   2. FLIP      — the image grows from its thumbnail's rectangle and returns to
 *                  the *current* thumbnail on close (transform only).
 *   3. Springs   — every motion is a spring that starts from the on-screen value
 *                  and keeps its velocity, so everything is interruptible.
 *   4. Gestures  — Pointer Events with pointer capture. 10 px to lock an axis,
 *                  then 1:1 tracking. Horizontal swipes page through photos with
 *                  momentum projection and velocity hand-off, rubber-banding at
 *                  the ends. Pulling down dismisses (image follows the finger,
 *                  backdrop fades; > 25 % projected travel closes toward the
 *                  thumbnail, otherwise it springs back).
 *   5. Reduced motion — no FLIP, no springs: 150 ms cross-fades. Gestures still
 *                  track the finger; releases just snap.
 *
 * Layout model. The `.lb-track` holds three absolutely positioned slides
 * [previous, current, next], each `step` px apart, translated together by `tx`.
 * The *current* image additionally carries a pose (x, y, s) used for FLIP and
 * the dismiss gesture. `b` is the backdrop/chrome opacity. Five independent
 * SpringValues (x, y, s, b, tx) — X and Y are never one 2-D spring.
 */
import {
  SpringValue,
  VelocityTracker,
  clamp,
  lerp,
  prefersReducedMotion,
  project,
  rubberband,
} from './motion';

interface Photo {
  link: HTMLAnchorElement;
  thumb: HTMLImageElement | null;
  avif: string;
  webp: string;
  href: string;
  width: number;
  height: number;
  ar: number;
  title: string | null;
  category: string;
  alt: string;
}

interface Slide {
  el: HTMLElement;
  img: HTMLImageElement | null;
  /** Index of the photo currently shown (−1 when empty). */
  n: number;
}

interface Pose {
  x: number;
  y: number;
  s: number;
}

type State = 'idle' | 'open' | 'closing';
type Axis = 'x' | 'y' | 'free';

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  /** Where tracking is measured from (the point where the axis locked). */
  lockX: number;
  lockY: number;
  axis: Axis | null;
  tx0: number;
  x0: number;
  y0: number;
  s0: number;
  b0: number;
  wasClosing: boolean;
  onImage: boolean;
}

/** Distance (px) before a gesture commits to an axis. */
const LOCK_THRESHOLD = 10;
/** Gap between neighbouring slides (px). */
const GAP = 24;
/** Breathing room around the fitted image inside the stage (px). */
const PAD = 12;
/** Fraction of the viewport height a projected dismiss must exceed. */
const DISMISS_FRACTION = 0.25;

/** Spring recipes (damping ratio, response in seconds). */
const SPRING_UI = { damping: 1, response: 0.35 }; // open / close / buttons
const SPRING_FLICK = { damping: 0.85, response: 0.35 }; // after a gesture with momentum

const REDUCED_FADE_MS = 150;

export class Lightbox {
  private readonly dialog: HTMLDialogElement;
  private readonly bg: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly track: HTMLElement;
  private readonly chromes: HTMLElement[];
  private readonly btnClose: HTMLButtonElement;
  private readonly btnPrev: HTMLButtonElement;
  private readonly btnNext: HTMLButtonElement;
  private readonly elTitle: HTMLElement;
  private readonly elCat: HTMLElement;
  private readonly elCount: HTMLElement;

  private readonly photos: Photo[];
  private slides: Slide[] = [];

  private state: State = 'idle';
  private index = 0;
  private opener: HTMLElement | null = null;
  private reduced = false;
  /** Fade instead of FLIP (thumbnail off-screen, or reduced motion). */
  private fade = false;
  /** Direction of a slide animation in flight (0 = none). */
  private pendingDir = 0;
  private drag: Drag | null = null;
  private readonly velocity = new VelocityTracker();
  private reducedTimer = 0;
  private resizeObserver: ResizeObserver | null = null;

  // Stage metrics (viewport coordinates), refreshed by measure().
  private stageW = 0;
  private stageH = 0;
  private stageCx = 0;
  private stageCy = 0;
  private step = 0;

  // Presentation state. Each is an independent, interruptible spring.
  private readonly x = new SpringValue(0, () => this.render());
  private readonly y = new SpringValue(0, () => this.render());
  private readonly s = new SpringValue(1, () => this.render(), { restDelta: 0.0005, restSpeed: 0.005 });
  private readonly b = new SpringValue(0, () => this.render(), { restDelta: 0.002, restSpeed: 0.01 });
  private readonly tx = new SpringValue(0, () => this.render());

  constructor(private readonly root: HTMLElement, dialog: HTMLDialogElement) {
    this.dialog = dialog;
    const q = <T extends HTMLElement>(sel: string) => dialog.querySelector<T>(sel)!;
    this.bg = q('[data-lb-bg]');
    this.stage = q('[data-lb-stage]');
    this.track = q('[data-lb-track]');
    this.chromes = [...dialog.querySelectorAll<HTMLElement>('[data-lb-chrome]')];
    this.btnClose = q('[data-lb-close]');
    this.btnPrev = q('[data-lb-prev]');
    this.btnNext = q('[data-lb-next]');
    this.elTitle = q('[data-lb-title]');
    this.elCat = q('[data-lb-cat]');
    this.elCount = q('[data-lb-count]');

    this.photos = [...root.querySelectorAll<HTMLAnchorElement>('a[data-lb]')].map((link) => {
      const d = link.dataset;
      const thumb = link.querySelector('img');
      const width = Number(d.w);
      const height = Number(d.h);
      return {
        link,
        thumb,
        avif: d.avif ?? '',
        webp: d.webp ?? '',
        href: link.href,
        width,
        height,
        ar: width / height,
        title: d.title ?? null,
        category: d.category ?? '',
        alt: thumb?.alt ?? '',
      };
    });

    this.bind();
  }

  // ---------------------------------------------------------------- wiring

  private bind(): void {
    this.root.addEventListener('click', (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-lb]');
      if (!a || !this.root.contains(a)) return;
      // Let the browser handle "open in new tab" style clicks.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      this.open(Number(a.dataset.index), a);
    });

    const d = this.dialog;
    d.addEventListener('keydown', (e) => this.onKey(e));
    // Esc → native "cancel": run our animated close instead of the instant one.
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.close();
    });
    // If the browser closes the dialog by itself, make sure we clean up.
    d.addEventListener('close', () => this.cleanup());

    this.btnClose.addEventListener('click', () => this.close());
    this.btnPrev.addEventListener('click', () => this.go(-1));
    this.btnNext.addEventListener('click', () => this.go(1));

    const st = this.stage;
    st.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    st.addEventListener('pointermove', (e) => this.onPointerMove(e));
    st.addEventListener('pointerup', (e) => this.onPointerUp(e));
    st.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
    // The browser must never start a native image drag / context gesture on the stage.
    st.addEventListener('dragstart', (e) => e.preventDefault());
  }

  /** Called on window resize (once, from the module-level listener). */
  relayout(): void {
    if (this.state === 'idle') return;
    this.measure();
    this.layoutSlides();
    for (const sl of this.slides) this.fit(sl);
  }

  // ----------------------------------------------------------------- open

  open(index: number, trigger: HTMLElement): void {
    if (this.state !== 'idle' || !this.photos[index] || this.dialog.open) return;
    this.reduced = prefersReducedMotion();
    this.dialog.toggleAttribute('data-reduced', this.reduced);
    this.index = index;
    this.opener = trigger;
    this.state = 'open';
    this.pendingDir = 0;
    document.documentElement.classList.add('lb-open');

    this.x.set(0);
    this.y.set(0);
    this.s.set(1);
    this.tx.set(0);
    this.b.set(0);

    this.dialog.showModal();
    // Caption first: its text can change the footer height, which sizes the stage.
    this.updateChrome();
    this.measure();
    this.buildSlides();
    this.watchStage();
    this.btnClose.focus({ preventScroll: true });

    const from = this.reduced ? null : this.thumbPose(index);
    this.fade = !from;
    this.render();

    if (this.reduced) {
      // Cross-fade via CSS transition: force a style flush, then set the end state.
      void this.dialog.offsetWidth;
      this.b.set(1);
      return;
    }
    if (from) {
      // FLIP: start exactly on the thumbnail, spring to the final rectangle.
      this.x.set(from.x);
      this.y.set(from.y);
      this.s.set(from.s);
      void this.x.animateTo(0, SPRING_UI);
      void this.y.animateTo(0, SPRING_UI);
      void this.s.animateTo(1, SPRING_UI);
    }
    void this.b.animateTo(1, SPRING_UI);
  }

  // ---------------------------------------------------------------- close

  /** Closes toward the current thumbnail. Interruptible; may carry gesture velocity. */
  close(velocity?: { x: number; y: number }): void {
    if (this.state !== 'open') return;
    this.state = 'closing';
    this.commitPending();
    window.clearTimeout(this.reducedTimer);

    if (this.reduced) {
      this.b.set(0); // CSS transition fades it
      this.reducedTimer = window.setTimeout(() => this.finish(), REDUCED_FADE_MS);
      return;
    }

    const target = this.thumbPose(this.index);
    this.fade = !target;
    const runs: Promise<boolean>[] = [];
    // Everything starts from its current on-screen value (and velocity).
    runs.push(this.b.animateTo(0, SPRING_UI));
    if (target) {
      runs.push(this.x.animateTo(target.x, { ...SPRING_UI, velocity: velocity?.x }));
      runs.push(this.y.animateTo(target.y, { ...SPRING_UI, velocity: velocity?.y }));
      runs.push(this.s.animateTo(target.s, SPRING_UI));
    } else {
      // Off-screen thumbnail: settle the pose and cross-fade.
      runs.push(this.x.animateTo(0, SPRING_UI), this.y.animateTo(0, SPRING_UI), this.s.animateTo(1, SPRING_UI));
    }
    void Promise.all(runs).then((all) => {
      // If any spring was interrupted (the user grabbed the image again) we stay open.
      if (all.every(Boolean) && this.state === 'closing') this.finish();
    });
  }

  private finish(): void {
    if (this.dialog.open) this.dialog.close();
    this.cleanup();
  }

  private cleanup(): void {
    if (this.state === 'idle') return;
    window.clearTimeout(this.reducedTimer);
    this.resizeObserver?.disconnect();
    this.state = 'idle';
    this.drag = null;
    this.pendingDir = 0;
    this.fade = false;
    for (const v of [this.x, this.y, this.s, this.b, this.tx]) v.stop();
    document.documentElement.classList.remove('lb-open');
    this.track.replaceChildren();
    this.slides = [];
    const link = this.photos[this.index]?.link ?? this.opener;
    // Only let the page scroll to the thumbnail if it is not already on screen.
    link?.focus({ preventScroll: !!this.thumbPose(this.index) });
    this.opener = null;
  }

  // ----------------------------------------------------------- navigation

  /** Previous / next from keys or buttons. Spring from wherever the track is. */
  go(dir: -1 | 1): void {
    if (this.state !== 'open' || this.poseBusy()) return;
    const vel = this.commitPending();
    // Checked after committing a half-finished slide: the index may have moved on.
    if (this.index + dir < 0 || this.index + dir >= this.photos.length) return;
    this.slideTo(dir, vel, false);
  }

  /** True while the FLIP / dismiss pose is animating (open, close, spring back). */
  private poseBusy(): boolean {
    return this.x.animating || this.y.animating || this.s.animating;
  }

  /**
   * Animates the track one step (or back to rest with dir = 0). On arrival the
   * slides are rotated so the new photo becomes the centre slide.
   */
  private slideTo(dir: number, velocity: number | undefined, momentum: boolean): void {
    if (this.reduced) {
      if (dir !== 0) this.shift(dir);
      this.tx.set(0);
      return;
    }
    this.pendingDir = dir;
    const recipe = momentum ? SPRING_FLICK : SPRING_UI;
    void this.tx.animateTo(-dir * this.step, { ...recipe, velocity }).then((done) => {
      if (!done) return; // grabbed or superseded: whoever interrupted owns the state
      this.pendingDir = 0;
      if (dir !== 0) this.shift(dir);
    });
  }

  /**
   * If a slide animation is in flight, finishes it logically *now* without a
   * visual jump: the index advances and the track offset is compensated so the
   * pictures stay exactly where they are on screen. Returns the track velocity.
   */
  private commitPending(): number {
    const dir = this.pendingDir;
    if (dir === 0) return this.tx.velocity;
    const velocity = this.tx.velocity;
    const offset = this.tx.value + dir * this.step;
    this.tx.stop();
    this.pendingDir = 0;
    this.shift(dir, offset);
    return velocity;
  }

  /** Moves the window of three slides one photo forward (+1) or back (−1). */
  private shift(dir: number, offset = 0): void {
    this.index += dir;
    const [prev, cur, next] = this.slides;
    if (dir > 0) {
      this.slides = [cur, next, prev];
      this.fill(prev, this.index + 1, false);
    } else {
      this.slides = [next, prev, cur];
      this.fill(next, this.index - 1, false);
    }
    for (const sl of this.slides) {
      if (sl.img && sl !== this.slides[1]) {
        sl.img.style.transform = '';
        sl.img.style.opacity = '';
      }
    }
    this.layoutSlides();
    this.tx.set(offset);
    this.updateChrome();
    this.render();
  }

  // --------------------------------------------------------------- layout

  /** Keeps metrics and slide sizes right if the stage resizes (rotation, toolbar, fonts). */
  private watchStage(): void {
    this.resizeObserver?.disconnect();
    let first = true;
    this.resizeObserver = new ResizeObserver(() => {
      if (first) return void (first = false); // initial callback: nothing changed yet
      this.relayout();
    });
    this.resizeObserver.observe(this.stage);
  }

  private measure(): void {
    const r = this.stage.getBoundingClientRect();
    this.stageW = r.width;
    this.stageH = r.height;
    this.stageCx = r.left + r.width / 2;
    this.stageCy = r.top + r.height / 2;
    this.step = r.width + GAP;
  }

  private buildSlides(): void {
    this.track.replaceChildren();
    this.slides = [0, 1, 2].map(() => {
      const el = document.createElement('div');
      el.className = 'lb-slide';
      this.track.append(el);
      return { el, img: null, n: -1 };
    });
    this.fill(this.slides[0], this.index - 1, false);
    this.fill(this.slides[1], this.index, true);
    this.fill(this.slides[2], this.index + 1, false);
    this.layoutSlides();
  }

  private layoutSlides(): void {
    this.slides.forEach((sl, i) => {
      sl.el.style.transform = `translate3d(${(i - 1) * this.step}px,0,0)`;
    });
  }

  /** Size of the photo fitted (contain) inside the stage. */
  private fitSize(p: Photo): { w: number; h: number } {
    const maxW = Math.max(1, this.stageW - 2 * PAD);
    const maxH = Math.max(1, this.stageH - 2 * PAD);
    const w = Math.min(maxW, maxH * p.ar);
    return { w, h: w / p.ar };
  }

  private fit(sl: Slide): void {
    const p = this.photos[sl.n];
    if (!sl.img || !p) return;
    const { w, h } = this.fitSize(p);
    sl.img.style.width = `${w}px`;
    sl.img.style.height = `${h}px`;
    sl.img.sizes = `${Math.round(w)}px`;
  }

  /** (Re)creates the picture of a slide for photo `i`; empty if out of range. */
  private fill(sl: Slide, i: number, priority: boolean): void {
    sl.el.replaceChildren();
    sl.img = null;
    sl.n = -1;
    const p = this.photos[i];
    if (!p) return;
    const { w, h } = this.fitSize(p);
    const pic = document.createElement('picture');
    for (const [type, srcset] of [
      ['image/avif', p.avif],
      ['image/webp', p.webp],
    ] as const) {
      const src = document.createElement('source');
      src.type = type;
      src.srcset = srcset;
      src.sizes = `${Math.round(w)}px`;
      pic.append(src);
    }
    const img = document.createElement('img');
    img.alt = p.alt;
    img.src = p.href;
    img.sizes = `${Math.round(w)}px`;
    img.width = p.width;
    img.height = p.height;
    img.decoding = 'async';
    img.draggable = false;
    img.fetchPriority = priority ? 'high' : 'low';
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    // The already-decoded thumbnail paints instantly while the large file loads.
    const placeholder = p.thumb?.currentSrc;
    if (placeholder) img.style.backgroundImage = `url("${placeholder}")`;
    pic.append(img);
    sl.el.append(pic);
    sl.img = img;
    sl.n = i;
  }

  private updateChrome(): void {
    const p = this.photos[this.index];
    this.elTitle.textContent = p.title ?? '';
    this.elCat.textContent = p.category;
    this.elCount.textContent = `${this.index + 1} / ${this.photos.length}`;
    const atStart = this.index === 0;
    const atEnd = this.index === this.photos.length - 1;
    const active = document.activeElement;
    this.btnPrev.disabled = atStart;
    this.btnNext.disabled = atEnd;
    // A disabled button cannot keep focus: hand it to the one that still works.
    if (active === this.btnPrev && atStart) this.btnNext.focus({ preventScroll: true });
    if (active === this.btnNext && atEnd) this.btnPrev.focus({ preventScroll: true });
  }

  // --------------------------------------------------------------- render

  /** Writes the current presentation state to the DOM. transform + opacity only. */
  private render(): void {
    if (!this.slides.length) return;
    this.track.style.transform = `translate3d(${this.tx.value}px,0,0)`;
    const img = this.slides[1]?.img;
    if (img) {
      img.style.transform = `translate3d(${this.x.value}px,${this.y.value}px,0) scale(${this.s.value})`;
      img.style.opacity = this.fade ? String(clamp(this.b.value, 0, 1)) : '';
    }
    const b = String(clamp(this.b.value, 0, 1));
    this.bg.style.opacity = b;
    for (const c of this.chromes) c.style.opacity = b;
  }

  // ----------------------------------------------------------------- FLIP

  /**
   * The pose that makes the centre image coincide with photo `i`'s thumbnail,
   * or null when the thumbnail is not on screen (then we cross-fade).
   * Thumbnails keep the photo's ratio (no cropping), so a uniform scale suffices.
   */
  private thumbPose(i: number): Pose | null {
    const thumb = this.photos[i]?.thumb;
    if (!thumb) return null;
    const r = thumb.getBoundingClientRect();
    const onScreen = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (!onScreen) return null;
    const { w } = this.fitSize(this.photos[i]);
    return {
      x: r.left + r.width / 2 - this.stageCx,
      y: r.top + r.height / 2 - this.stageCy,
      s: r.width / w,
    };
  }

  // -------------------------------------------------------------- gestures

  private onPointerDown(e: PointerEvent): void {
    if (this.state === 'idle' || this.drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.stage.setPointerCapture(e.pointerId);
    this.velocity.reset();
    this.velocity.add(e.clientX, e.clientY);

    // Interruptibility: freeze everything where it is on screen, with its velocity.
    const trackMoving = this.tx.animating;
    const poseMoving = this.poseBusy();
    const wasClosing = this.state === 'closing';
    window.clearTimeout(this.reducedTimer);
    for (const v of [this.x, this.y, this.s, this.b, this.tx]) v.stop();
    this.pendingDir = 0;
    this.state = 'open'; // grabbing a closing image re-opens it

    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lockX: e.clientX,
      lockY: e.clientY,
      axis: trackMoving ? 'x' : poseMoving ? 'free' : null,
      tx0: this.tx.value,
      x0: this.x.value,
      y0: this.y.value,
      s0: this.s.value,
      b0: this.b.value,
      wasClosing,
      onImage: (e.target as Element).tagName === 'IMG',
    };
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.velocity.add(e.clientX, e.clientY);

    if (!d.axis) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_THRESHOLD) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      // Tracking starts from the lock point, so nothing jumps by the threshold.
      d.lockX = e.clientX;
      d.lockY = e.clientY;
    }
    this.track1to1(d, e.clientX, e.clientY);
  }

  /** 1:1 tracking relative to where the axis locked (respects the grab point). */
  private track1to1(d: Drag, cx: number, cy: number): void {
    const dx = cx - d.lockX;
    const dy = cy - d.lockY;

    if (d.axis === 'x') {
      let raw = d.tx0 + dx;
      const hasPrev = this.index > 0;
      const hasNext = this.index < this.photos.length - 1;
      // Rubber band at the first / last photo.
      if (raw > 0 && !hasPrev) raw = rubberband(raw, this.stageW);
      else if (raw < 0 && !hasNext) raw = -rubberband(-raw, this.stageW);
      this.tx.set(clamp(raw, -this.step, this.step));
      return;
    }

    if (d.axis === 'free') {
      this.x.set(d.x0 + dx);
      this.y.set(d.y0 + dy);
      return;
    }

    // Vertical: the image follows the finger, shrinks a little, the backdrop fades.
    let yy = dy;
    if (yy < 0) yy = -rubberband(-yy, this.stageH); // pulling up resists
    const progress = clamp(yy / (this.stageH * 0.6), 0, 1);
    const sc = lerp(1, 0.72, progress);
    // Keep the point the user grabbed under their finger while the image scales.
    const gx = d.lockX - this.stageCx;
    const gy = d.lockY - this.stageCy;
    this.s.set(sc);
    this.x.set(dx + gx * (1 - sc));
    this.y.set(yy + gy * (1 - sc));
    this.b.set(yy > 0 ? clamp(1 - yy / (this.stageH * 0.5), 0, 1) : 1);
  }

  private onPointerUp(e: PointerEvent, cancelled = false): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    const v = cancelled ? { x: 0, y: 0 } : this.velocity.velocity();

    if (!d.axis) {
      // A tap. On the empty stage it closes; on the image it does nothing.
      if (!cancelled && !d.onImage) this.close();
      return;
    }
    if (d.axis === 'x') this.releaseX(v.x);
    else if (d.axis === 'y') this.releaseY(v);
    else this.releaseFree(d, v);
  }

  /** Horizontal release: project the momentum, pick previous / stay / next. */
  private releaseX(vx: number): void {
    const projected = this.tx.value + project(vx);
    let dir = clamp(Math.round(-projected / this.step), -1, 1);
    if (dir < 0 && this.index === 0) dir = 0;
    if (dir > 0 && this.index === this.photos.length - 1) dir = 0;
    this.slideTo(dir, vx, true);
  }

  /** Vertical release: close toward the thumbnail if the projection is far enough. */
  private releaseY(v: { x: number; y: number }): void {
    const projected = this.y.value + project(v.y);
    if (projected > this.stageH * DISMISS_FRACTION) this.close(v);
    else this.springBack(v);
  }

  /** Released after grabbing a moving image: carry on closing, or settle open. */
  private releaseFree(d: Drag, v: { x: number; y: number }): void {
    const projected = this.y.value - d.y0 + project(v.y);
    if (d.wasClosing && projected > -this.stageH * 0.1) this.close(v);
    else this.springBack(v);
  }

  /** Back to the resting pose with the finger's velocity. */
  private springBack(v: { x: number; y: number }): void {
    if (this.reduced) {
      this.x.set(0);
      this.y.set(0);
      this.s.set(1);
      this.b.set(1);
      return;
    }
    void this.x.animateTo(0, { ...SPRING_FLICK, velocity: v.x });
    void this.y.animateTo(0, { ...SPRING_FLICK, velocity: v.y });
    void this.s.animateTo(1, SPRING_UI);
    void this.b.animateTo(1, SPRING_UI);
  }

  // ------------------------------------------------------------- keyboard

  private onKey(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.go(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.go(1);
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
      case 'Tab': {
        // Trap focus inside the dialog (cycle through the enabled buttons).
        const items = [this.btnClose, this.btnPrev, this.btnNext].filter((b) => !b.disabled);
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === -1 || i === items.length - 1 ? 0 : i + 1;
        e.preventDefault();
        items[next].focus({ preventScroll: true });
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ mounting

let current: Lightbox | null = null;
let listening = false;
const mounted = new WeakSet<HTMLElement>();

/**
 * Finds the gallery on the current page and wires it up. Safe to call on every
 * `astro:page-load`: each page gets a fresh instance, the window listener is
 * registered once.
 */
export function initLightbox(): void {
  const root = document.querySelector<HTMLElement>('[data-gallery]');
  const dialog = root?.querySelector<HTMLDialogElement>('dialog[data-lightbox]');
  if (!root || !dialog || mounted.has(root)) return;
  mounted.add(root);
  current = new Lightbox(root, dialog);
  if (!listening) {
    listening = true;
    addEventListener('resize', () => current?.relayout());
  }
}
