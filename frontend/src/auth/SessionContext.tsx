import { createContext, useContext } from "react";
import type { SessionUser } from "./useSession";

export interface SessionState {
  session: { user: SessionUser } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function useSessionContext() {
  return useContext(SessionContext);
}
