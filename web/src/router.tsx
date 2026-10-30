import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout, RequirePermission, HomeRedirect } from "./layouts/AppLayout";
import { AuthGate, FullPageLoader } from "./layouts/AuthGate";
import { NotFound } from "./pages/NotFound";
import type { Permission } from "./lib/domain";

/**
 * Route-level code splitting: the landing page, customer portal and each
 * console screen load only when visited.
 */
const page = <T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType })));

const LandingPage = page(() => import("./pages/landing/Landing"), "LandingPage");
const LoginPage = page(() => import("./pages/auth/Login"), "LoginPage");
const SignupPage = page(() => import("./pages/auth/Signup"), "SignupPage");
const OverviewPage = page(() => import("./pages/app/Overview"), "OverviewPage");
const ReturnsPage = page(() => import("./pages/app/Returns"), "ReturnsPage");
const OrdersPage = page(() => import("./pages/app/Orders"), "OrdersPage");
const PickupsPage = page(() => import("./pages/app/Pickups"), "PickupsPage");
const InspectionQueuePage = page(() => import("./pages/app/Inspection"), "InspectionQueuePage");
const InspectReturnPage = page(() => import("./pages/app/Inspection"), "InspectReturnPage");
const RefundsPage = page(() => import("./pages/app/Refunds"), "RefundsPage");
const InventoryPage = page(() => import("./pages/app/Inventory"), "InventoryPage");
const RiskPage = page(() => import("./pages/app/Risk"), "RiskPage");
const AnalyticsPage = page(() => import("./pages/app/Analytics"), "AnalyticsPage");
const RulesPage = page(() => import("./pages/app/Rules"), "RulesPage");
const NotificationsPage = page(() => import("./pages/app/Notifications"), "NotificationsPage");
const IntegrationsPage = page(() => import("./pages/app/Integrations"), "IntegrationsPage");
const TeamPage = page(() => import("./pages/app/Team"), "TeamPage");
const SettingsPage = page(() => import("./pages/app/Settings"), "SettingsPage");
const AuditPage = page(() => import("./pages/app/Audit"), "AuditPage");
const AboutPage = page(() => import("./pages/site/Company"), "AboutPage");
const ContactPage = page(() => import("./pages/site/Company"), "ContactPage");
const SecurityPage = page(() => import("./pages/site/Company"), "SecurityPage");
const PrivacyPage = page(() => import("./pages/site/Legal"), "PrivacyPage");
const TermsPage = page(() => import("./pages/site/Legal"), "TermsPage");
const CookiesPage = page(() => import("./pages/site/Legal"), "CookiesPage");
const RefundPolicyPage = page(() => import("./pages/site/Legal"), "RefundPolicyPage");
const PortalPage = page(() => import("./pages/portal/Portal"), "PortalPage");
const TrackPage = page(() => import("./pages/portal/Track"), "TrackPage");

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<FullPageLoader />}>{children}</Suspense>;
const Inner = ({ children }: { children: ReactNode }) => <Suspense fallback={<div className="min-h-[50vh]" />}>{children}</Suspense>;
const guarded = (permission: Permission, el: ReactNode) => <RequirePermission permission={permission}><Inner>{el}</Inner></RequirePermission>;

export const router = createBrowserRouter([
  { path: "/", element: <S><LandingPage /></S> },
  { path: "/about", element: <S><AboutPage /></S> },
  { path: "/contact", element: <S><ContactPage /></S> },
  { path: "/security", element: <S><SecurityPage /></S> },
  { path: "/privacy", element: <S><PrivacyPage /></S> },
  { path: "/terms", element: <S><TermsPage /></S> },
  { path: "/cookies", element: <S><CookiesPage /></S> },
  { path: "/refund-policy", element: <S><RefundPolicyPage /></S> },
  { path: "/login", element: <AuthGate mode="guest"><S><LoginPage /></S></AuthGate> },
  { path: "/signup", element: <AuthGate mode="guest"><S><SignupPage /></S></AuthGate> },
  {
    path: "/app",
    element: <AuthGate mode="private"><AppLayout /></AuthGate>,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: "overview", element: guarded("dashboard:view", <OverviewPage />) },
      { path: "returns", element: guarded("returns:view", <ReturnsPage />) },
      { path: "pickups", element: guarded("pickups:manage", <PickupsPage />) },
      { path: "inspection", element: guarded("inspection:perform", <InspectionQueuePage />) },
      { path: "inspection/:id", element: guarded("inspection:perform", <InspectReturnPage />) },
      { path: "refunds", element: guarded("refunds:issue", <RefundsPage />) },
      { path: "inventory", element: guarded("inventory:view", <InventoryPage />) },
      { path: "risk", element: guarded("risk:view", <RiskPage />) },
      { path: "analytics", element: guarded("analytics:view", <AnalyticsPage />) },
      { path: "orders", element: guarded("orders:view", <OrdersPage />) },
      { path: "rules", element: guarded("rules:manage", <RulesPage />) },
      { path: "notifications", element: guarded("notifications:view", <NotificationsPage />) },
      { path: "integrations", element: guarded("integrations:manage", <IntegrationsPage />) },
      { path: "team", element: guarded("team:view", <TeamPage />) },
      { path: "settings", element: guarded("settings:manage", <SettingsPage />) },
      { path: "audit", element: guarded("audit:view", <AuditPage />) },
      { path: "*", element: <Navigate to="/app" replace /> },
    ],
  },
  { path: "/r/:slug", element: <S><PortalPage /></S> },
  { path: "/r/:slug/track", element: <S><TrackPage /></S> },
  { path: "*", element: <NotFound /> },
]);
