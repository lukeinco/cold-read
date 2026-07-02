import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createScopedSupabase } from "@/lib/scoped-supabase";

interface SessionState {
  sessionId: string | null;
  sessionToken: string | null;
  mediaStream: MediaStream | null;
  scopedClient: SupabaseClient<Database> | null;
  setSession: (sessionId: string, sessionToken: string, stream: MediaStream) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const scopedClient = useMemo(
    () => (sessionToken ? createScopedSupabase(sessionToken) : null),
    [sessionToken],
  );

  const setSession = (id: string, token: string, stream: MediaStream) => {
    setSessionId(id);
    setSessionToken(token);
    setMediaStream(stream);
  };

  const clearSession = () => {
    mediaStream?.getTracks().forEach((t) => t.stop());
    setSessionId(null);
    setSessionToken(null);
    setMediaStream(null);
  };

  return (
    <SessionContext.Provider
      value={{ sessionId, sessionToken, mediaStream, scopedClient, setSession, clearSession }}
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
