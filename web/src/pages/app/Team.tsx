import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, UserPlus } from "lucide-react";
import clsx from "clsx";
import { api, ApiError, errorMessage } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/domain";
import { relative } from "@/lib/format";
import { useCan } from "@/lib/session";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader, Skeleton } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/misc";

type TeamData = {
  members: { id: string; role: string; status: string; createdAt: string; isYou: boolean; user: { id: string; name: string; email: string; lastLoginAt: string | null } }[];
  roles: { id: string; label: string; description: string; permissions: string[] }[];
  permissions: string[];
};

const PERMISSION_LABEL: Record<string, string> = {
  "dashboard:view": "View overview",
  "orders:view": "View orders",
  "orders:import": "Import orders",
  "returns:view": "View returns",
  "integrations:manage": "Manage order sync & API keys",
  "team:view": "View team",
  "team:manage": "Manage team",
  "settings:manage": "Portal & brand settings",
  "audit:view": "Read audit log",
};

export function TeamPage() {
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const { data } = useQuery({ queryKey: ["team"], queryFn: () => api<TeamData>("/team") });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: string; status?: string }) => api(`/team/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Team member updated");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const manage = can("team:manage");

  return (
    <>
      <PageHeader
        title="Team & roles"
        description="Everyone works in the same queue, but each role sees and does only what their job needs. Access is enforced by the server on every request."
        actions={manage && <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>Add teammate</Button>}
      />

      <Card className="overflow-hidden">
        {!data ? (
          <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : (
          <ul className="divide-y divide-line">
            {data.members.map((m) => (
              <li key={m.id} className={clsx("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5", m.status === "disabled" && "opacity-60")}>
                <Avatar name={m.user.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {m.user.name}
                    {m.isYou && <Badge>You</Badge>}
                    {m.status === "disabled" && <Badge tone="danger">Disabled</Badge>}
                  </div>
                  <div className="text-[12.5px] text-muted truncate">{m.user.email}</div>
                </div>
                <div className="text-[12.5px] text-muted w-32 hidden md:block">{m.user.lastLoginAt ? `Active ${relative(m.user.lastLoginAt)}` : "Never signed in"}</div>
                {manage && !m.isYou ? (
                  <div className="flex items-center gap-2">
                    <Select className="w-44" value={m.role} onChange={(e) => patch.mutate({ id: m.id, role: e.target.value })} aria-label={`Role for ${m.user.name}`}>
                      {data.roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </Select>
                    <Button variant={m.status === "active" ? "ghost" : "secondary"} size="sm" onClick={() => patch.mutate({ id: m.id, status: m.status === "active" ? "disabled" : "active" })}>
                      {m.status === "active" ? "Disable" : "Enable"}
                    </Button>
                  </div>
                ) : (
                  <span className="text-[13px] font-medium text-ink-2 w-44 text-right">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader title="What each role can do" description="New capabilities (approve, inspect, refund…) are added to these roles as each milestone ships." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-y border-line bg-paper/60">
                  <th className="text-left font-medium text-muted px-5 h-10 text-[12px]">Permission</th>
                  {data.roles.map((r) => <th key={r.id} className="font-medium px-3 text-[12px] text-ink-2" title={r.description}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.permissions.map((p) => (
                  <tr key={p}>
                    <td className="px-5 h-10 text-ink-2">{PERMISSION_LABEL[p] ?? p}</td>
                    {data.roles.map((r) => (
                      <td key={r.id} className="text-center">
                        {r.permissions.includes(p) ? <Check className="inline size-4 text-done" /> : <Minus className="inline size-3.5 text-line-strong" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && <AddMemberModal open={adding} onClose={() => setAdding(false)} roles={data.roles} />}
    </>
  );
}

function AddMemberModal({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: TeamData["roles"] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", role: "support", password: "" });
  const add = useMutation({
    mutationFn: () => api("/team", { method: "POST", body: form }),
    onSuccess: () => {
      toast.success(`${form.name} added — share their temporary password securely`);
      qc.invalidateQueries({ queryKey: ["team"] });
      setForm({ name: "", email: "", role: "support", password: "" });
      onClose();
    },
  });
  const err = add.error instanceof ApiError ? add.error : null;
  const role = roles.find((r) => r.id === form.role);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a teammate"
      description="They'll sign in with this email and the temporary password you set. Email invitations arrive with notifications in Milestone 2."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={add.isPending} onClick={() => add.mutate()}>Add teammate</Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && !err.fields && <div className="rounded-lg bg-danger-bg text-danger text-[13px] px-3.5 py-2.5">{err.message}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={err?.fieldError("name")} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={err?.fieldError("email")} />
        </div>
        <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} hint={role?.description}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
        <Input label="Temporary password" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={err?.fieldError("password")} hint="At least 8 characters" />
      </div>
    </Modal>
  );
}
