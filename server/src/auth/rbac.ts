/**
 * Role-based access control.
 *
 * Permissions are coarse-grained capabilities checked by the API on every
 * request (`requirePermission`) and mirrored in the web app to shape
 * navigation. The web app never decides access on its own.
 *
 * Later milestones add capabilities (returns:approve, returns:escalate,
 * inspection:perform, refunds:issue, rules:manage, ...) to this same table.
 */
export const ROLES = ["admin", "manager", "support", "warehouse", "finance"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard:view",
  "orders:view",
  "orders:import",
  "returns:view",
  "integrations:manage",
  "team:view",
  "team:manage",
  "settings:manage",
  "audit:view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: ["dashboard:view", "orders:view", "returns:view", "team:view", "audit:view"],
  support: ["dashboard:view", "orders:view", "returns:view"],
  warehouse: ["returns:view"],
  finance: ["dashboard:view", "orders:view", "returns:view", "audit:view"],
};

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  admin: { label: "Admin", description: "Owns the workspace: rules, users, integrations and branding." },
  manager: { label: "Manager", description: "Approves high-value or flagged returns and reads analytics." },
  support: { label: "Support Agent", description: "Reviews return requests and talks to customers." },
  warehouse: { label: "Warehouse Staff", description: "Receives parcels, inspects items and restocks." },
  finance: { label: "Finance", description: "Processes and reconciles refunds and store credit." },
};

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);
export const permissionsFor = (role: Role): Permission[] => [...MATRIX[role]];
export const can = (role: Role, permission: Permission) => MATRIX[role].includes(permission);
