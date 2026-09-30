import type { Request } from "express";
import { db, type Tx } from "../db.js";

export type Actor =
  | { type: "user"; id: string; label: string }
  | { type: "customer"; id?: string; label: string }
  | { type: "api_key"; id: string; label: string }
  | { type: "system"; label: string };

export async function audit(
  entry: {
    organizationId: string;
    actor: Actor;
    action: string;
    entityType?: string;
    entityId?: string;
    meta?: Record<string, unknown>;
    req?: Request;
  },
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      actorType: entry.actor.type,
      actorId: "id" in entry.actor ? entry.actor.id : undefined,
      actorLabel: entry.actor.label,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      meta: entry.meta ? JSON.stringify(entry.meta) : undefined,
      ip: entry.req?.ip,
    },
  });
}
