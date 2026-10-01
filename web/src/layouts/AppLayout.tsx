import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { LayoutGrid, Undo2, ShoppingBag, Plug, Users, Settings2, ScrollText, ExternalLink, LogOut, Menu, X, ChevronsUpDown, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { Permission } from "@/lib/domain";
import { useCan, useSession, useSignOut } from "@/lib/session";
import { Avatar, Logo } from "@/components/ui/misc";

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; permission: Permission; badge?: number };

export function HomeRedirect() {
  const can = useCan();
  return <Navigate to={can("dashboard:view") ? "/app/overview" : "/app/returns"} replace />;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useCan();
  if (!can(permission)) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center">
        <div className="mx-auto mb-4 grid place-items-center size-11 rounded-xl bg-paper-2 text-muted">
          <Lock className="size-5" />
        </div>
        <h1 className="text-[17px] font-semibold">Your role doesn't include this page</h1>
        <p className="mt-1 text-muted text-[14px]">Ask a workspace admin if you need access.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function AppLayout() {
  const session = useSession();
  const can = useCan();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pending = useQuery({
    queryKey: ["returns", "pending-count"],
    queryFn: () => api<{ total: number }>("/returns?status=requested&pageSize=5"),
    enabled: can("returns:view"),
    refetchInterval: 30_000,
  });

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const operate: NavItem[] = [
    { to: "/app/overview", label: "Overview", icon: LayoutGrid, permission: "dashboard:view" },
    { to: "/app/returns", label: "Returns", icon: Undo2, permission: "returns:view", badge: pending.data?.total },
    { to: "/app/orders", label: "Orders", icon: ShoppingBag, permission: "orders:view" },
  ];
  const workspace: NavItem[] = [
    { to: "/app/integrations", label: "Order sync", icon: Plug, permission: "integrations:manage" },
    { to: "/app/team", label: "Team & roles", icon: Users, permission: "team:view" },
    { to: "/app/settings", label: "Portal & brand", icon: Settings2, permission: "settings:manage" },
    { to: "/app/audit", label: "Audit log", icon: ScrollText, permission: "audit:view" },
  ];

  const sidebar = (
    <div className="flex h-full flex-col bg-[#131519] text-[#c9c6bf]">
      <div className="flex items-center justify-between h-14 px-4">
        <Logo inverted />
        <button className="lg:hidden grid place-items-center size-8 rounded-md hover:bg-white/5" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="size-4" />
        </button>
      </div>

      <OrgSwitcher />

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4">
        <NavGroup items={operate.filter((i) => can(i.permission))} />
        {workspace.some((i) => can(i.permission)) && (
          <>
            <GroupLabel>Workspace</GroupLabel>
            <NavGroup items={workspace.filter((i) => can(i.permission))} />
          </>
        )}
      </nav>

      <a
        href={`/r/${session.organization.slug}`}
        target="_blank"
        rel="noreferrer"
        className="mx-3 mb-3 flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors group"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-white">Customer portal</div>
          <div className="font-mono text-[11px] text-[#8b877f] truncate">/r/{session.organization.slug}</div>
        </div>
        <ExternalLink className="size-3.5 text-[#8b877f] group-hover:text-white" />
      </a>

      <UserMenu />
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="hidden lg:block sticky top-0 h-dvh">{sidebar}</aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[272px] animate-rise">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-paper/90 backdrop-blur border-b border-line">
          <button onClick={() => setMobileOpen(true)} className="grid place-items-center size-9 -ml-1 rounded-md hover:bg-paper-2" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Logo />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-[1320px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="mt-5 mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.09em] text-[#6f6c66]">{children}</div>;
}

function NavGroup({ items }: { items: NavItem[] }) {
  return (
    <ul className="space-y-px mt-2">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13.5px] transition-colors",
                isActive ? "bg-white/[0.08] text-white before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-kraft" : "hover:bg-white/[0.04] hover:text-white",
              )
            }
          >
            <item.icon className="size-4" strokeWidth={1.75} />
            <span className="flex-1">{item.label}</span>
            {!!item.badge && <span className="min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-kraft/20 text-[#e6b877] text-[11px] font-semibold tabular">{item.badge}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function OrgSwitcher() {
  const { organization, roleLabel } = useSession();
  return (
    <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2 bg-white/[0.03] border border-white/[0.06]">
      <span className="grid place-items-center size-7 rounded-md text-white text-[12px] font-semibold shrink-0 overflow-hidden" style={{ background: organization.brandColor }}>
        {organization.logoUrl ? <img src={organization.logoUrl} alt="" className="size-full object-cover" /> : organization.name[0]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-white truncate">{organization.name}</div>
        <div className="text-[11.5px] text-[#8b877f] truncate">{roleLabel}</div>
      </div>
      <ChevronsUpDown className="size-3.5 text-[#6f6c66]" />
    </div>
  );
}

function UserMenu() {
  const { user } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative border-t border-white/[0.06] p-2">
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 rounded-lg bg-[#1d2025] border border-white/10 p-1 shadow-xl animate-rise">
          <button
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
            className="flex w-full items-center gap-2 h-8 px-2.5 rounded-md text-[13px] hover:bg-white/5 text-white"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.04] text-left">
        <Avatar name={user.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-white truncate">{user.name}</div>
          <div className="text-[11.5px] text-[#8b877f] truncate">{user.email}</div>
        </div>
      </button>
    </div>
  );
}
