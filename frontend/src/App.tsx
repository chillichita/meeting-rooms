import { Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider } from './auth';
import { useAuth } from './auth-context';

// Temporary stubs — replaced by MR-16 (login), MR-17b (home), MR-17c (room grid), Epic 6 (/me).
function Stub({ label }: { label: string }) {
  const { user, loading } = useAuth();
  return (
    <main className="stub">
      <p>{label}</p>
      <p className="mono">{loading ? 'checking session…' : user ? `signed in as ${user.email}` : 'not signed in'}</p>
    </main>
  );
}

function HomePage() {
  return <Stub label="Home — room picker (MR-17b)" />;
}

function LoginPage() {
  return <Stub label="Auth — login / register (MR-16)" />;
}

function RoomPage() {
  const { id } = useParams();
  return <Stub label={`Room ${id} — WeekGrid (MR-17c)`} />;
}

function MyBookingsPage() {
  return <Stub label="My bookings (Epic 6)" />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/rooms/:id" element={<RoomPage />} />
        <Route path="/me" element={<MyBookingsPage />} />
      </Routes>
    </AuthProvider>
  );
}
