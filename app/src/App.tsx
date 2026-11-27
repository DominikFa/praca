import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import type { Role } from './types';
import { AnalyticsView } from './views/AnalyticsView';
import { AuthView } from './views/AuthView';
import { EventsView } from './views/EventsView';
import { OrdersView } from './views/OrdersView';
import { ScannerView } from './views/ScannerView';
import { TicketsView } from './views/TicketsView';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem' }}>Restoring session...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;
  if (user) return <Navigate to="/events" replace />;
  return <>{children}</>;
}

function RoleRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== role) {
    return <Navigate to="/events" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <AuthView />
                </PublicOnlyRoute>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/events" replace />} />
              <Route path="/events" element={<EventsView />} />
              <Route
                path="/tickets"
                element={
                  <RoleRoute role="USER">
                    <TicketsView />
                  </RoleRoute>
                }
              />
              <Route
                path="/orders"
                element={
                  <RoleRoute role="USER">
                    <OrdersView />
                  </RoleRoute>
                }
              />
              <Route path="/scanner" element={<ScannerView />} />
              <Route
                path="/analytics"
                element={
                  <RoleRoute role="ORGANIZER">
                    <AnalyticsView />
                  </RoleRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/events" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;