import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout, RequirePermission, HomeRedirect } from "./layouts/AppLayout";
import { AuthGate } from "./layouts/AuthGate";
import { LoginPage } from "./pages/auth/Login";
import { SignupPage } from "./pages/auth/Signup";
import { OverviewPage } from "./pages/app/Overview";
import { ReturnsPage } from "./pages/app/Returns";
import { OrdersPage } from "./pages/app/Orders";
import { IntegrationsPage } from "./pages/app/Integrations";
import { TeamPage } from "./pages/app/Team";
import { SettingsPage } from "./pages/app/Settings";
import { AuditPage } from "./pages/app/Audit";
import { PortalPage } from "./pages/portal/Portal";
import { TrackPage } from "./pages/portal/Track";
import { NotFound } from "./pages/NotFound";
import { LandingPage } from "./pages/landing/Landing";

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/login", element: <AuthGate mode="guest"><LoginPage /></AuthGate> },
  { path: "/signup", element: <AuthGate mode="guest"><SignupPage /></AuthGate> },
  {
    path: "/app",
    element: <AuthGate mode="private"><AppLayout /></AuthGate>,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: "overview", element: <RequirePermission permission="dashboard:view"><OverviewPage /></RequirePermission> },
      { path: "returns", element: <RequirePermission permission="returns:view"><ReturnsPage /></RequirePermission> },
      { path: "orders", element: <RequirePermission permission="orders:view"><OrdersPage /></RequirePermission> },
      { path: "integrations", element: <RequirePermission permission="integrations:manage"><IntegrationsPage /></RequirePermission> },
      { path: "team", element: <RequirePermission permission="team:view"><TeamPage /></RequirePermission> },
      { path: "settings", element: <RequirePermission permission="settings:manage"><SettingsPage /></RequirePermission> },
      { path: "audit", element: <RequirePermission permission="audit:view"><AuditPage /></RequirePermission> },
      { path: "*", element: <Navigate to="/app" replace /> },
    ],
  },
  { path: "/r/:slug", element: <PortalPage /> },
  { path: "/r/:slug/track", element: <TrackPage /> },
  { path: "*", element: <NotFound /> },
]);
