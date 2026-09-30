import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/misc";

type Entry = { id: string; actorType: string; actorLabel: string; action: string; entityType: string | null; entityId: string | null; meta: Record<string, unknown> | null; ip: string | null; createdAt: string };

const ACTIONS: Record<string, string> = {
  "workspace.created": "Created the workspace",
  "auth.login": "Signed in",
  "return.requested": "Requested a return",
  "orders.csv_imported": "Imported orders from CSV",
  "orders.api_upsert": "Pushed orders via API",
  "orders.webhook_received": "Received orders by webhook",
  "integration.shopify_connected": "Connected Shopify",
  "integration.shopify_synced": "Synced Shopify orders",
  "integration.shopify_disconnected": "Disconnected Shopify",
  "integration.webhook_secret_revealed": "Revealed the webhook secret",
  "integration.webhook_secret_rotated": "Rotated the webhook secret",
  "api_key.created": "Created an API key",
  "api_key.revoked": "Revoked an API key",
  "team.member_added": "Added a teammate",
  "team.member_updated": "Changed a teammate's access",
  "settings.updated": "Updated portal settings",
  "settings.logo_updated": "Uploaded a new logo",
};

const ACTOR_TONE: Record<string, string> = { user: "bg-ink text-white", customer: "bg-kraft-soft text-kraft-ink", api_key: "bg-progress-bg text-progress", system: "bg-paper-2 text-muted" };

function summarize(e: Entry) {
  const m = e.meta ?? {};
  const bits: string[] = [];
  if (m.rma) bits.push(String(m.rma));
  if (m.order) bits.push(`order #${m.order}`);
  if (m.file) bits.push(String(m.file));
  if (m.name) bits.push(`“${m.name}”`);
  if (m.email) bits.push(String(m.email));
  if (typeof m.created === "number") bits.push(`${m.created} new, ${m.updated} updated${m.failed ? `, ${m.failed} failed` : ""}`);
  if (m.role) bits.push(`as ${m.role}`);
  if (m.to && typeof m.to === "object") bits.push(Object.entries(m.to as object).map(([k, v]) => `${k} → ${v}`).join(", "));
  if (m.mode) bits.push(String(m.mode));
  return bits.join(" · ");
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const { data } = useQuery({
    queryKey: ["audit", page, action],
    queryFn: () => api<{ total: number; page: number; pageSize: number; entries: Entry[] }>(`/audit?page=${page}&pageSize=30${action ? `&action=${action}` : ""}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Audit log"
        description="An append-only record of who did what — sign-ins, imports, key changes, and every return request. Approvals, refunds and inventory changes are recorded here as they arrive."
        actions={
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-52" aria-label="Filter">
            <option value="">All activity</option>
            <option value="return.">Returns</option>
            <option value="orders.">Order imports</option>
            <option value="integration.">Integrations</option>
            <option value="api_key.">API keys</option>
            <option value="team.">Team</option>
            <option value="auth.">Sign-ins</option>
            <option value="settings.">Settings</option>
          </Select>
        }
      />
      <Card className="overflow-hidden">
        {!data ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : data.entries.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-5" />} title="Nothing recorded yet" />
        ) : (
          <ul className="divide-y divide-line">
            {data.entries.map((e) => (
              <li key={e.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[150px_1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="text-[12.5px] text-muted tabular order-3 sm:order-none col-span-2 sm:col-span-1">{dateTime(e.createdAt)}</span>
                <div className="min-w-0">
                  <span className={`inline-block mr-2 px-1.5 rounded text-[11.5px] font-medium ${ACTOR_TONE[e.actorType] ?? ""}`}>{e.actorLabel}</span>
                  <span className="text-[13.5px]">{ACTIONS[e.action] ?? e.action}</span>
                  {summarize(e) && <div className="text-[12.5px] text-muted truncate mt-0.5">{summarize(e)}</div>}
                </div>
                <span className="font-mono text-[11px] text-faint">{e.ip?.replace("::ffff:", "") ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
