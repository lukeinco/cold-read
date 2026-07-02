import { createContext, useContext, useState, type ReactNode } from "react";

interface SessionState {
  sessionId: string | null;
  mediaStream: MediaStream | null;
  setSession: (sessionId: string, stream: MediaStream) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const setSession = (id: string, stream: MediaStream) => {
    setSessionId(id);
    setMediaStream(stream);
  };

  const clearSession = () => {
    mediaStream?.getTracks().forEach((t) => t.stop());
    setSessionId(null);
    setMediaStream(null);
  };

  return (
    <SessionContext.Provider value={{ sessionId, mediaStream, setSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
