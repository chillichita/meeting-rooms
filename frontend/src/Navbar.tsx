import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { toZonedTime } from 'date-fns-tz';
import { useAuth } from './auth-context';
import RoomPickerModal from './RoomPickerModal';

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
  // Home covers "/" (the picker); Schedule covers "/rooms/:id" (the schedule).
  const scheduleActive = pathname.startsWith('/rooms');
  // Home is the dark space canvas — the pill turns dark glass there, light elsewhere.
  const glass = pathname === '/';

  const [now, setNow] = useState(() => new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  // close the mobile menu on navigation
  useEffect(() => setMenuOpen(false), [pathname]);

  const kyiv = toZonedTime(now, OFFICE_TZ);
  const clock = `${String(kyiv.getHours()).padStart(2, '0')}:${String(kyiv.getMinutes()).padStart(2, '0')}`;

  const onLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <>
      <header className={`navbar${glass ? ' glass' : ' light'}`}>
        <Link to="/" className="logo">
          <LogoClock />
          Meridian
        </Link>
        <nav>
          <NavLink to="/" className={pathname === '/' ? 'active' : ''}>
            Rooms
          </NavLink>
          <button
            type="button"
            className={`navlink${scheduleActive ? ' active' : ''}`}
            onClick={() => setPickerOpen(true)}
          >
            Schedule
          </button>
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
          <button
            type="button"
            className="burger"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </header>

      <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
        <button type="button" className="close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
          ✕
        </button>
        <Link to="/" onClick={() => setMenuOpen(false)}>
          Rooms
        </Link>
        <button
          type="button"
          className="navlink"
          onClick={() => {
            setMenuOpen(false);
            setPickerOpen(true);
          }}
        >
          Schedule
        </button>
        <Link to="/me" onClick={() => setMenuOpen(false)}>
          My bookings
        </Link>
      </div>

      <RoomPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
