import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { toZonedTime } from 'date-fns-tz';
import { useAuth } from './auth-context';

const OFFICE_TZ = 'Europe/Kyiv';

/** H1 — the logo mark is a live clock showing office time (Europe/Kyiv). */
function LogoClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const kyiv = toZonedTime(now, OFFICE_TZ);
  // arc starts pointing at 12; rotate clockwise by office hours
  const angle = ((kyiv.getHours() + kyiv.getMinutes() / 60) / 12) * 360;
  const label = `${String(kyiv.getHours()).padStart(2, '0')}:${String(kyiv.getMinutes()).padStart(2, '0')} Kyiv`;

  return (
    <svg viewBox="0 0 52 52" className="logo-mark" role="img" aria-label={`Office time: ${label}`}>
      <title>{label}</title>
      <circle cx="26" cy="26" r="21" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <path
        d="M26 26 Q 15 18 13 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        transform={`rotate(${angle} 26 26)`}
        style={{ transition: 'transform 1s linear' }}
      />
    </svg>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Rooms covers both "/" (the picker) and "/rooms/:id" (the schedule).
  const roomsActive = pathname === '/' || pathname.startsWith('/rooms');
  // Home is the dark space canvas — the pill turns dark glass there, light elsewhere.
  const glass = pathname === '/';

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const kyiv = toZonedTime(now, OFFICE_TZ);
  const clock = `${String(kyiv.getHours()).padStart(2, '0')}:${String(kyiv.getMinutes()).padStart(2, '0')}`;

  const onLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className={`navbar${glass ? ' glass' : ' light'}`}>
      <Link to="/" className="logo">
        <LogoClock />
        Meridian
      </Link>
      <nav>
        <NavLink to="/" className={roomsActive ? 'active' : ''}>
          Rooms
        </NavLink>
        <NavLink to="/me" className={({ isActive }) => (isActive ? 'active' : '')}>
          My bookings
        </NavLink>
      </nav>
      <div className="right">
        <span className="clock mono">Kyiv {clock}</span>
        {user ? (
          <div className="chip">
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <span className="chip-mail">{user.email}</span>
            <button type="button" className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        ) : (
          <Link to="/login" className="btn btn-primary btn-sm">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
