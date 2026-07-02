import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createScopedSupabase } from "@/lib/scoped-supabase";

interface SessionState {
  sessionId: string | null;
  sessionToken: string | null;
  mediaStream: MediaStream | null;
  getMediaStream: () => MediaStream | null;
  scopedClient: SupabaseClient<Database> | null;
  setSession: (sessionId: string, sessionToken: string, stream: MediaStream) => void;
  stopAllTracks: () => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const scopedClient = useMemo(
    () => (sessionToken ? createScopedSupabase(sessionToken) : null),
    [sessionToken],
  );

  const setSession = (id: string, token: string, stream: MediaStream) => {
    setSessionId(id);
    setSessionToken(token);
    streamRef.current = stream;
    setMediaStream(stream);
  };

  const stopAllTracks = () => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    setMediaStream(null);
  };

  const getMediaStream = () => streamRef.current;

  const clearSession = () => {
    stopAllTracks();
    setSessionId(null);
    setSessionToken(null);
  };

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        sessionToken,
        mediaStream,
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
