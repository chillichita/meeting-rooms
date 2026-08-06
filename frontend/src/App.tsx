import { Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import LoginPage from './LoginPage';
import HomePage from './HomePage';
import Navbar from './Navbar';
import RoomPage from './RoomPage';
import MyBookingsPage from './MyBookingsPage';

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
