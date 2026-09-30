import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { Permission, Session } from "./domain";

const Ctx = createContext<Session | null>(null);

export function useSessionQuery() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await api<Session>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

export function useCan() {
  const s = useSession();
  return (p: Permission) => s.permissions.includes(p);
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    qc.clear();
    qc.setQueryData(["session"], null);
  };
}
