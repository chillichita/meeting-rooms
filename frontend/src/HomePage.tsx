import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toZonedTime } from 'date-fns-tz';
import { api, type Room } from './api';
import { mountSparkles } from './sparkles';

const OFFICE_TZ = 'Europe/Kyiv';
const OFFICE_OPEN = 9;
const OFFICE_CLOSE = 19;

// Demo photos keyed by room name (info/design/meridian-full-demo.html).
const PHOTOS: Record<string, string> = {
  Mercury: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=65',
  Venus: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=65',
  Earth: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=800&q=65',
  Mars: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=800&q=65',
  Jupiter: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800&q=65',
  Saturn: 'https://images.unsplash.com/photo-1560264280-88b68371db39?w=800&q=65',
};

export default function HomePage() {
  const location = useLocation();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState(false);
  const [cur, setCur] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const roomsRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const domeRef = useRef<HTMLDivElement>(null);
  const domeGlowRef = useRef<HTMLDivElement>(null);
  const heroSunRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const roomsGlowRef = useRef<HTMLDivElement>(null);
  const terminusRef = useRef<HTMLDivElement>(null);
  const heroInnerRef = useRef<HTMLDivElement>(null);
  const roomsRevealRef = useRef<HTMLDivElement>(null);
  const sparkleRef = useRef<HTMLCanvasElement>(null);
  const idxRowRef = useRef<HTMLDivElement>(null);
  const idxFillRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const load = () => {
    setError(false);
    api<Room[]>('/api/rooms')
      .then((list) => {
        setRooms(list);
        setCur((c) => (c < list.length ? c : 0));
      })
      .catch(() => setError(true));
  };

  useEffect(load, []);

  // nav "Rooms" arrives with a flag → land on the rooms section instead of the hero.
  useEffect(() => {
    const state = location.state as { scrollToRooms?: boolean } | null;
    if (state?.scrollToRooms) {
      roomsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.state]);

  // the hero canvas is dark full-bleed; keep the strip behind the floating nav dark too.
  useEffect(() => {
    document.body.classList.add('dark');
    return () => document.body.classList.remove('dark');
  }, []);

  // sparkle field on the hero (Stardust port) — pauses off-screen, static under reduced motion.
  useEffect(() => {
    const dispose = sparkleRef.current
      ? mountSparkles(sparkleRef.current, { density: 2.2, minSize: 0.6, maxSize: 1.5, speed: 0.1 })
      : undefined;
    return () => dispose?.();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Meridian: one line from the dome top, through the rooms, to the footer terminus —
  // drawn by scroll, with dome parallax, seam vignette, rooms glow and terminus light.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    let totalLen = 0;
    let ticking = false;

    const buildPath = () => {
      const stage = stageRef.current;
      const svg = svgRef.current;
      const path = pathRef.current;
      const dome = domeRef.current;
      const footer = footerRef.current;
      if (!stage || !svg || !path || !dome || !footer) return;
      const stageH = stage.offsetHeight;
      const stageW = stage.offsetWidth;
      svg.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`);
      svg.style.height = `${stageH}px`;
      const stageRect = stage.getBoundingClientRect();
      const startY = dome.getBoundingClientRect().top - stageRect.top;
      const endY = footer.getBoundingClientRect().top - stageRect.top + 34; // the terminus dot
      path.setAttribute('d', `M${stageW / 2} ${startY} L${stageW / 2} ${endY}`);
      totalLen = path.getTotalLength();
      path.style.strokeDasharray = String(totalLen);
      path.style.strokeDashoffset = String(totalLen);
    };

    const triangle = (x: number, center: number, halfWidth: number) =>
      Math.max(0, 1 - Math.abs(x - center) / halfWidth);

    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

    const update = () => {
      ticking = false;
      const hero = heroRef.current;
      if (mq.matches || !hero) return; // mobile: static, no scroll-linked motion

      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const docH = document.documentElement.scrollHeight - vh;
      const pageProgress = docH > 0 ? Math.min(1, Math.max(0, scrollY / docH)) : 0;

      if (totalLen && pathRef.current) {
        pathRef.current.style.strokeDashoffset = String(totalLen * (1 - pageProgress));
      }
      const heroH = hero.offsetHeight;
      const heroProgress = Math.min(1, Math.max(0, scrollY / heroH));
      if (domeRef.current) domeRef.current.style.transform = `translate(-50%, ${-heroProgress * 70}px)`;
      if (domeGlowRef.current) domeGlowRef.current.style.opacity = String(0.7 + heroProgress * 0.3);
      if (heroSunRef.current) heroSunRef.current.style.opacity = String(0.8 + heroProgress * 0.2);

      // hero text fades + shrinks as it leaves the viewport; rooms content fades + settles in.
      const heroInner = heroInnerRef.current;
      const roomsReveal = roomsRevealRef.current;
      if (heroInner && roomsReveal) {
        // hero text fades with scroll progress, not absolute viewport position —
        // the demo formula dimmed the headline at rest on most screens
        const heroFade = clamp01(scrollY / (vh * 0.6));
        heroInner.style.opacity = String(1 - heroFade);
        heroInner.style.transform = `scale(${1 - heroFade * 0.08})`;

        const revealRect = roomsReveal.getBoundingClientRect();
        const roomsFade = clamp01((vh * 0.92 - revealRect.top) / (vh * 0.5));
        roomsReveal.style.opacity = String(roomsFade);
        roomsReveal.style.transform = `scale(${0.96 + roomsFade * 0.04}) translateY(${(1 - roomsFade) * 20}px)`;
      }

      const glow = roomsGlowRef.current;
      if (glow) {
        const rect = glow.getBoundingClientRect();
        const roomsMid = triangle(vh / 2, (rect.top + rect.bottom) / 2, vh * 0.6);
        glow.style.opacity = String(0.65 + roomsMid * 0.35);
      }

      const footer = footerRef.current;
      if (footer && terminusRef.current) {
        terminusRef.current.classList.toggle('lit', footer.getBoundingClientRect().top < vh * 0.85);
      }
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    const init = () => {
      buildPath();
      update();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // rebuild the meridian geometry on any stage size change — covers data
    // loading (placeholder → card), error state, fonts, images and window
    // resizes alike, where the old resize+fonts.ready pair missed content growth
    const ro = new ResizeObserver(() => {
      buildPath();
      update();
    });
    if (stageRef.current) ro.observe(stageRef.current);
    init();
    return () => {
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // keep the amber underline under the active room number.
  useEffect(() => {
    const fill = idxFillRef.current;
    const row = idxRowRef.current;
    if (!fill || !row) return;
    const active = row.querySelector<HTMLElement>('.idx.on');
    if (active) {
      fill.style.left = `${active.offsetLeft}px`;
      fill.style.width = `${active.offsetWidth}px`;
    }
  }, [cur, rooms]);

  const go = (i: number) => {
    if (rooms.length === 0) return;
    const next = (i + rooms.length) % rooms.length;
    if (next === cur) return;
    window.clearTimeout(timerRef.current);
    setSwitching(true);
    timerRef.current = window.setTimeout(() => {
      setCur(next);
      setSwitching(false);
    }, 260);
  };

  const kyiv = toZonedTime(now, OFFICE_TZ);
  const hour = kyiv.getHours() + kyiv.getMinutes() / 60;
  const open = hour >= OFFICE_OPEN && hour < OFFICE_CLOSE;

  const selected = rooms[cur] ?? null;

  return (
    <div className="stage" ref={stageRef}>
      <svg className="meridian-svg" ref={svgRef} preserveAspectRatio="none" aria-hidden="true">
        <path ref={pathRef} className="meridian-path" d="" />
      </svg>

      {/* hero: dome arc, cool center glow, amber sunrise at the dome rim */}
      <section className="hero" ref={heroRef}>
        <canvas className="sparkle-canvas" ref={sparkleRef} aria-hidden="true" />
        <div className="dome-layer" ref={domeRef}>
          <div className="dome-glow" ref={domeGlowRef} />
          <div className="dome" />
        </div>
        <div className="hero-sun" ref={heroSunRef} />
        <div className="grain" />
        <div className="hero-inner" ref={heroInnerRef}>
          <span className="badge mono">
            {rooms.length} meeting rooms · Office time Europe/Kyiv
          </span>
          <h1 className="mono">
            One time,
            <br />
            every zone.
          </h1>
          <p className="sub">
            Book a meeting room across time zones — the schedule shows in your time, the office
            runs on Kyiv.
          </p>
          <button
            type="button"
            className="btn-hero"
            onClick={() => roomsRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            Book a room
          </button>
        </div>
        <div className="vignette" ref={vignetteRef} />
      </section>

      {/* rooms: one glass card at a time, fed by the meridian */}
      <section className="rooms" id="rooms" ref={roomsRef}>
        <div className="rooms-glow" ref={roomsGlowRef} />
        <div className="rooms-inner">
          {/* reveal choreography lives on the head + nav only — the card stays outside
              the animated wrapper so its backdrop-filter still blurs the meridian behind it. */}
          <div className="rooms-reveal" ref={roomsRevealRef}>
            <div className="rooms-head">
              <span className="label">Rooms</span>
              <span className="count mono">
                {error ? '' : `${String(cur + 1).padStart(2, '0')} / ${String(rooms.length).padStart(2, '0')}`}
              </span>
            </div>

            {error ? (
              <div className="space-error">
                <p>Couldn't load the rooms.</p>
                <p className="sub">The server may be temporarily unavailable.</p>
                <button type="button" className="btn btn-ghost-d" onClick={load}>
                  Try again
                </button>
              </div>
            ) : selected ? null : (
              <div className="space-error">
                <p>No rooms yet.</p>
              </div>
            )}
          </div>

          {selected && !error && (
            <>
              <div
                className="card"
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  touchRef.current = { x: t.clientX, y: t.clientY };
                }}
                onTouchEnd={(e) => {
                  const start = touchRef.current;
                  touchRef.current = null;
                  if (!start) return;
                  const dx = e.changedTouches[0].clientX - start.x;
                  const dy = e.changedTouches[0].clientY - start.y;
                  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1));
                }}
              >
                {PHOTOS[selected.name] && (
                  <div className={`card-photo${switching ? ' switching' : ''}`}>
                    <img
                      src={PHOTOS[selected.name]}
                      alt={`${selected.name} meeting room`}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}
                <div className={`card-text${switching ? ' switching' : ''}`}>
                  <div className="room-name">{selected.name}</div>
                  <div className="specs">
                    <span>
                      Capacity <b>{selected.capacity}</b>
                    </span>
                    <span>
                      Floor <b>{selected.floor}</b>
                    </span>
                  </div>
                  <div className="status">
                    {open ? (
                      <>Free now — office hours run 09:00–19:00 Kyiv.</>
                    ) : (
                      <>
                        <span className="status-chip">Office closed</span>
                        opens 09:00 Kyiv.
                      </>
                    )}
                  </div>
                  <Link to={`/rooms/${selected.id}`} className="btn-card">
                    Book
                  </Link>
                </div>
              </div>

              <div className="nav-row">
                <button type="button" className="wbtn" aria-label="Previous room" onClick={() => go(cur - 1)}>
                  ‹
                </button>
                <div className="idx-row mono" ref={idxRowRef}>
                  <div className="idx-track" />
                  <div className="idx-fill" ref={idxFillRef} />
                  {rooms.map((room, i) => (
                    <button
                      key={room.id}
                      type="button"
                      className={`idx${i === cur ? ' on' : ''}`}
                      aria-label={`Show ${room.name}`}
                      onClick={() => go(i)}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </button>
                  ))}
                </div>
                <button type="button" className="wbtn" aria-label="Next room" onClick={() => go(cur + 1)}>
                  ›
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* footer: meridian terminus */}
      <footer className="footer" ref={footerRef}>
        <div className="footer-inner">
          <div className="terminus" ref={terminusRef} />
          <div className="logo">
            <svg viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <circle cx="26" cy="26" r="21" stroke="#fff" strokeWidth="2.2" />
              <path d="M26 26 Q 15 18 13 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            </svg>
            Meridian
          </div>
          <div className="footer-links">
            <Link to="/">Rooms</Link>
            <Link to="/me">My bookings</Link>
          </div>
          <div className="footer-fine mono">Office hours run on Europe/Kyiv, every time.</div>
        </div>
      </footer>
    </div>
  );
}
