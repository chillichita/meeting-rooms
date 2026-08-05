import { Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { useAuth } from './auth-context';
import LoginPage from './LoginPage';
import HomePage from './HomePage';
import Navbar from './Navbar';
import RoomPage from './RoomPage';

// Temporary stubs — replaced by Epic 6 (/me).
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
