import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./dashboard/Dashboard";
import { BoardPage } from "./dashboard/BoardPage";
import { LoginPage } from "./auth/LoginPage";
import { useSession } from "./auth/useSession";
import { SessionContext, useSessionContext } from "./auth/SessionContext";
import { useColorScheme } from "./theme/useColorScheme";

function AppRoutes() {
  const { session, loading } = useSessionContext();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--color-text-muted)" }}>
        Loading…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/board/:id" element={<BoardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useColorScheme();
  const { session, loading, signOut } = useSession();

  return (
    <SessionContext.Provider value={{ session, loading, signOut }}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionContext.Provider>
  );
}
