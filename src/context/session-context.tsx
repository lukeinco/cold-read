import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createScopedSupabase } from "@/lib/scoped-supabase";
import * as mic from "@/lib/mic";

interface SessionState {
  sessionId: string | null;
  sessionToken: string | null;
  getMediaStream: () => MediaStream | null;
  scopedClient: SupabaseClient<Database> | null;
  setSession: (sessionId: string, sessionToken: string) => void;
  stopAllTracks: () => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const scopedClient = useMemo(
    () => (sessionToken ? createScopedSupabase(sessionToken) : null),
    [sessionToken],
  );

  const setSession = (id: string, token: string) => {
    setSessionId(id);
    setSessionToken(token);
  };

  const stopAllTracks = () => {
    mic.release();
  };

  const getMediaStream = () => mic.getExisting();

  const clearSession = () => {
    mic.release();
    setSessionId(null);
    setSessionToken(null);
  };

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        sessionToken,
        getMediaStream,
        scopedClient,
        setSession,
        stopAllTracks,
        clearSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
