import { Outlet, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './auth';
import { useAuth } from './auth-context';
import LoginPage from './LoginPage';
import HomePage from './HomePage';
import Navbar from './Navbar';

// Temporary stubs — replaced by MR-17c (room grid) and Epic 6 (/me).
function Stub({ label }: { label: string }) {
  const { user, loading } = useAuth();
  return (
    <main className="stub">
      <p>{label}</p>
      <p className="mono">
        {loading ? 'checking session…' : user ? `signed in as ${user.email}` : 'not signed in'}
      </p>
    </main>
  );
}

function RoomPage() {
  const { id } = useParams();
  return <Stub label={`Room ${id} — WeekGrid (MR-17c)`} />;
}

function MyBookingsPage() {
  return <Stub label="My bookings (Epic 6)" />;
}

function Layout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms/:id" element={<RoomPage />} />
          <Route path="/me" element={<MyBookingsPage />} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </AuthProvider>
  );
}
