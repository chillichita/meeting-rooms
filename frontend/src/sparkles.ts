export type SparkleOptions = {
  density?: number;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  color?: string;
};

/**
 * Vanilla-JS port of the Stardust particle field
 * (info/design/dark_theme/stardust_effect.txt → demos' mountSparkles).
 * Pauses while off-screen via IntersectionObserver; renders one static
 * frame under prefers-reduced-motion. Returns a dispose function.
 */
export function mountSparkles(canvas: HTMLCanvasElement, opts: SparkleOptions = {}): () => void {
  const { density = 2.2, minSize = 0.6, maxSize = 1.4, speed = 0.12, color = '255,255,255' } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  type Particle = { x: number; y: number; vx: number; vy: number; size: number; o: number; ov: number };
  let particles: Particle[] = [];
  let raf = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.floor(((w * h) / 10000) * density);
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      size: minSize + Math.random() * (maxSize - minSize),
      o: Math.random(),
      ov: (Math.random() - 0.5) * 0.02,
    }));
  };

  const draw = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      if (!reduceMotion) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        p.o += p.ov;
        if (p.o <= 0.15 || p.o >= 1) p.ov *= -1;
        p.o = Math.max(0.15, Math.min(1, p.o));
      }
      ctx.fillStyle = `rgba(${color},${p.o})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const loop = () => {
    draw();
    raf = requestAnimationFrame(loop);
  };

  resize();
  window.addEventListener('resize', resize);
  if (reduceMotion) {
    draw();
  } else {
    loop();
  }

  let io: IntersectionObserver | null = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(([entry]) => {
      if (reduceMotion) return;
      if (entry.isIntersecting && !raf) loop();
      if (!entry.isIntersecting && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(canvas);
  }

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    io?.disconnect();
  };
}
