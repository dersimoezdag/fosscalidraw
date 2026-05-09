import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./dashboard/Dashboard";
import { BoardPage } from "./dashboard/BoardPage";
import { LoginPage } from "./auth/LoginPage";
import { useSession } from "./auth/useSession";
import { useColorScheme } from "./theme/useColorScheme";

export default function App() {
  useColorScheme();
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--color-text-muted)" }}>
        Loading…
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" replace />} />
        <Route path="/board/:id" element={<BoardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
