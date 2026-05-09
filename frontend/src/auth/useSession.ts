import { useState, useEffect } from "react";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string;
  role?: string;
}

export function useSession() {
  const [session, setSession] = useState<{ user: SessionUser } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/auth/session`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setSession(data?.user ? data : null))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await fetch("/auth/signout", { method: "POST", credentials: "include" });
    setSession(null);
    window.location.href = "/login";
  };

  return { session, loading, signOut };
}
