import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSessionQuery, SessionProvider } from "@/lib/session";
import { Spinner } from "@/components/ui/Spinner";

export function FullPageLoader() {
  return (
    <div className="min-h-dvh grid place-items-center text-muted">
      <Spinner className="size-5" />
    </div>
  );
}

export function AuthGate({ mode, children }: { mode: "private" | "guest" | "redirect"; children?: ReactNode }) {
  const { data: session, isLoading } = useSessionQuery();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;

  if (mode === "redirect") return <Navigate to={session ? "/app" : "/login"} replace />;
  if (mode === "guest") {
    if (session) return <Navigate to={(location.state as { from?: string } | null)?.from ?? "/app"} replace />;
    return <>{children}</>;
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
