import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { FlaskConical, Pencil, Plus, Trash2, Workflow, X } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { REASONS, RESOLUTIONS } from "@/lib/domain";
import { relative } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";

type FieldMeta = { label: string; type: "number" | "enum" | "text" | "boolean"; unit?: string; options?: string[] };
type Condition = { field: string; op: string; value: string | number | boolean };
type Rule = { id: string; name: string; enabled: boolean; priority: number; match: "all" | "any"; conditions: Condition[]; action: string; actionNote: string | null; matchCount: number; lastMatchedAt: string | null };
type RulesData = { rules: Rule[]; fields: Record<string, FieldMeta>; actions: Record<string, string> };

const OPS: Record<string, [string, string][]> = {
  number: [["gt", "is more than"], ["gte", "is at least"], ["lt", "is less than"], ["lte", "is at most"], ["eq", "equals"]],
  enum: [["is", "is"], ["is_not", "is not"]],
  text: [["is", "is"], ["is_not", "is not"], ["contains", "contains"]],
  boolean: [["is", "is"]],
};
const OPTION_LABEL: Record<string, string> = { ...REASONS, prepaid: "Prepaid", cod: "Cash on delivery", ...Object.fromEntries(Object.entries(RESOLUTIONS).map(([k, v]) => [k, v.short])) };
const ACTION_TONE: Record<string, "done" | "danger" | "review" | "progress" | "neutral"> = { auto_approve: "done", auto_reject: "danger", require_manager: "review", flag: "review", hold_refund: "progress" };

function valueText(field: FieldMeta | undefined, v: Condition["value"]) {
  if (!field) return String(v);
  if (field.unit === "currency") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (field.type === "boolean") return v ? "yes" : "no";
  return OPTION_LABEL[String(v)] ?? String(v);
}

export function RulesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["rules"], queryFn: () => api<RulesData>("/rules") });
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string; enabled: boolean }) => api(`/rules/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Rule deleted");
      qc.invalidateQueries({ queryKey: ["rules"] });
    },
  });

  return (
    <>
      <PageHeader
        title="Rules & policy"
        description="Every new request is checked against your return policy, then your rules in priority order. Staff only see the requests that need a human."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New rule</Button>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px] items-start">
        <div className="space-y-3 min-w-0">
          {!data ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)
          ) : data.rules.length === 0 ? (
            <Card><EmptyState icon={<Workflow className="size-5" />} title="No rules yet" action={<Button onClick={() => setEditing("new")}>Create your first rule</Button>}>For example: IF return value is more than ₹10,000 THEN require manager approval.</EmptyState></Card>
          ) : (
            data.rules.map((r) => (
              <Card key={r.id} className={clsx("p-4 sm:p-5 transition-opacity", !r.enabled && "opacity-60")}>
                <div className="flex items-start gap-4">
                  <Toggle on={r.enabled} onChange={(v) => patch.mutate({ id: r.id, enabled: v })} label={`Enable ${r.name}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold">{r.name}</h3>
                      <span className="font-mono text-[11px] text-faint">#{r.priority}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className="font-mono text-[11px] font-semibold text-kraft-ink">IF</span>
                      {r.conditions.map((c, i) => (
                        <span key={i} className="contents">
                          {i > 0 && <span className="font-mono text-[11px] text-faint">{r.match === "all" ? "AND" : "OR"}</span>}
                          <span className="inline-flex items-center h-7 px-2 rounded-md bg-paper border border-line text-ink-2">
                            {data.fields[c.field]?.label} <span className="mx-1 text-muted">{OPS[data.fields[c.field]?.type ?? "text"].find(([k]) => k === c.op)?.[1]}</span> <b className="font-medium text-ink">{valueText(data.fields[c.field], c.value)}</b>
                          </span>
                        </span>
                      ))}
                      <span className="font-mono text-[11px] font-semibold text-progress ml-1">THEN</span>
                      <Badge tone={ACTION_TONE[r.action]}>{data.actions[r.action]}</Badge>
                    </div>
                    {r.actionNote && <p className="mt-2 text-[12.5px] text-muted">“{r.actionNote}”</p>}
                    <div className="mt-2 text-[12px] text-faint">{r.matchCount ? `Matched ${r.matchCount} request${r.matchCount === 1 ? "" : "s"}${r.lastMatchedAt ? ` · last ${relative(r.lastMatchedAt)}` : ""}` : "Hasn't matched yet"}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditing(r)} className="grid place-items-center size-8 rounded-md text-muted hover:bg-paper-2 hover:text-ink" aria-label="Edit rule"><Pencil className="size-4" /></button>
                    <button onClick={() => confirm(`Delete “${r.name}”?`) && remove.mutate(r.id)} className="grid place-items-center size-8 rounded-md text-muted hover:bg-danger-bg hover:text-danger" aria-label="Delete rule"><Trash2 className="size-4" /></button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
        <PolicyCard />
      </div>
      {editing && data && <RuleEditor rule={editing === "new" ? null : editing} meta={data} onClose={() => setEditing(null)} />}
    </>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={clsx("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-done" : "bg-line-strong")}>
      <span className={clsx("absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-0")} />
    </button>
  );
}

function RuleEditor({ rule, meta, onClose }: { rule: Rule | null; meta: RulesData; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: rule?.name ?? "",
    priority: rule?.priority ?? 100,
    match: rule?.match ?? ("all" as "all" | "any"),
    conditions: rule?.conditions ?? [{ field: "value", op: "gt", value: 10000 } as Condition],
    action: rule?.action ?? "require_manager",
    actionNote: rule?.actionNote ?? "",
  });
  const [preview, setPreview] = useState<{ tested: number; matched: number; examples: { rma: string }[] } | null>(null);
  const save = useMutation({
    mutationFn: () => api(rule ? `/rules/${rule.id}` : "/rules", { method: rule ? "PATCH" : "POST", body: { ...form, actionNote: form.actionNote || undefined } }),
    onSuccess: () => {
      toast.success(rule ? "Rule updated" : "Rule created — it applies to new requests from now on");
      qc.invalidateQueries({ queryKey: ["rules"] });
      onClose();
    },
  });
  const test = useMutation({ mutationFn: () => api<typeof preview>("/rules/preview", { method: "POST", body: { match: form.match, conditions: form.conditions } }), onSuccess: setPreview });
  useEffect(() => setPreview(null), [form.conditions, form.match]);

  const setCond = (i: number, patch: Partial<Condition>) => setForm((f) => ({ ...f, conditions: f.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const err = save.error instanceof ApiError ? save.error : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={rule ? "Edit rule" : "New rule"}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" icon={<FlaskConical className="size-4" />} loading={test.isPending} onClick={() => test.mutate()}>Test on recent returns</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>{rule ? "Save rule" : "Create rule"}</Button>
        </>
      }
    >
      <div className="space-y-5">
        {err && !err.fields && <div className="rounded-lg bg-danger-bg text-danger text-[13px] px-3.5 py-2.5">{err.message}</div>}
        <div className="grid sm:grid-cols-[1fr_120px] gap-4">
          <Input label="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={err?.fieldError("name")} placeholder="High-value returns need a manager" />
          <Input label="Priority" type="number" min={1} max={999} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} hint="Lower runs first" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-ink-2"><span className="font-mono text-kraft-ink">IF</span> the request matches</span>
            <div className="inline-flex rounded-lg border border-line-strong p-0.5 text-[12.5px]">
              {(["all", "any"] as const).map((m) => (
                <button key={m} onClick={() => setForm({ ...form, match: m })} className={clsx("h-7 px-2.5 rounded-md font-medium", form.match === m ? "bg-ink text-white" : "text-muted")}>{m === "all" ? "all conditions" : "any condition"}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {form.conditions.map((c, i) => {
              const f = meta.fields[c.field];
              return (
                <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.3fr_1fr_1fr_auto] gap-2 items-start rounded-lg bg-paper p-2">
                  <Select aria-label="Field" value={c.field} onChange={(e) => {
                    const nf = meta.fields[e.target.value];
                    setCond(i, { field: e.target.value, op: OPS[nf.type][0][0], value: nf.type === "number" ? 0 : nf.type === "boolean" ? true : nf.options?.[0] ?? "" });
                  }} className="col-span-1">
                    {Object.entries(meta.fields).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                  <button onClick={() => setForm({ ...form, conditions: form.conditions.filter((_, j) => j !== i) })} disabled={form.conditions.length === 1} className="sm:order-last grid place-items-center size-10 rounded-md text-muted hover:bg-surface disabled:opacity-30" aria-label="Remove condition"><X className="size-4" /></button>
                  <Select aria-label="Operator" value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
                    {OPS[f.type].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  {f.type === "enum" ? (
                    <Select aria-label="Value" value={String(c.value)} onChange={(e) => setCond(i, { value: e.target.value })}>
                      {f.options!.map((o) => <option key={o} value={o}>{OPTION_LABEL[o] ?? o}</option>)}
                    </Select>
                  ) : f.type === "boolean" ? (
                    <Select aria-label="Value" value={String(c.value)} onChange={(e) => setCond(i, { value: e.target.value === "true" })}>
                      <option value="true">yes</option>
                      <option value="false">no</option>
                    </Select>
                  ) : (
                    <Input aria-label="Value" type={f.type === "number" ? "number" : "text"} value={String(c.value)} onChange={(e) => setCond(i, { value: f.type === "number" ? Number(e.target.value) : e.target.value })} trailing={f.unit === "currency" ? <span className="text-[12px] text-muted pr-1">₹</span> : undefined} />
                  )}
                </div>
              );
            })}
          </div>
          {form.conditions.length < 8 && (
            <button onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: "reason", op: "is", value: "defective" }] })} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
              <Plus className="size-3.5" /> Add condition
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Select label={<><span className="font-mono text-progress">THEN</span> do this</>} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
            {Object.entries(meta.actions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Textarea label={form.action === "auto_reject" ? "Message shown to the customer" : "Note (optional)"} value={form.actionNote} onChange={(e) => setForm({ ...form, actionNote: e.target.value })} className="[&_textarea]:min-h-10" maxLength={200} />
        </div>

        {preview && (
          <div className="rounded-lg border border-line bg-paper px-4 py-3 text-[13.5px] animate-rise">
            Would have matched <b className="tabular">{preview.matched}</b> of the last {preview.tested} requests
            {preview.examples.length > 0 && <span className="text-muted"> — e.g. {preview.examples.map((e) => e.rma).join(", ")}</span>}
          </div>
        )}
      </div>
    </Modal>
  );
}

type Policy = { returnWindowDays: number; nonReturnableCategories: string[]; autoApproveMax: number; maxReturnsPer90Days: number; requirePhotoForDamage: boolean; knownCategories: string[] };

function PolicyCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["policy"], queryFn: () => api<Policy>("/settings/policy") });
  const [form, setForm] = useState<Policy | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const save = useMutation({
    mutationFn: () => api("/settings/policy", { method: "PUT", body: form }),
    onSuccess: () => {
      toast.success("Return policy saved");
      qc.invalidateQueries({ queryKey: ["policy"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!form) return <Skeleton className="h-96" />;
  const dirty = JSON.stringify(form) !== JSON.stringify(data);
  const toggleCat = (c: string) => setForm({ ...form, nonReturnableCategories: form.nonReturnableCategories.includes(c) ? form.nonReturnableCategories.filter((x) => x !== c) : [...form.nonReturnableCategories, c] });
  return (
    <Card className="xl:sticky xl:top-8">
      <CardHeader title="Return policy" description="Checked before any rule runs." />
      <div className="px-5 pb-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Return window" type="number" value={form.returnWindowDays} onChange={(e) => setForm({ ...form, returnWindowDays: Number(e.target.value) })} trailing={<span className="text-[12px] text-muted pr-1">days</span>} />
          <Input label="Auto-approve up to" type="number" value={form.autoApproveMax} onChange={(e) => setForm({ ...form, autoApproveMax: Number(e.target.value) })} trailing={<span className="text-[12px] text-muted pr-1">₹</span>} />
        </div>
        <Input label="Review after this many returns in 90 days" type="number" value={form.maxReturnsPer90Days} onChange={(e) => setForm({ ...form, maxReturnsPer90Days: Number(e.target.value) })} />
        <div>
          <div className="text-[13px] font-medium text-ink-2 mb-1.5">Non-returnable categories</div>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...form.knownCategories, ...form.nonReturnableCategories])].map((c) => {
              const on = form.nonReturnableCategories.includes(c);
              return (
                <button key={c} onClick={() => toggleCat(c)} className={clsx("h-7 px-2.5 rounded-md border text-[12.5px] transition-colors", on ? "bg-danger-bg border-danger/30 text-danger" : "border-line text-ink-2 hover:border-line-strong")}>
                  {on && "✕ "}{c}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">Tap a category to block returns for it.</p>
        </div>
        <label className="flex items-start gap-2.5 text-[13.5px] cursor-pointer">
          <input type="checkbox" checked={form.requirePhotoForDamage} onChange={(e) => setForm({ ...form, requirePhotoForDamage: e.target.checked })} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
          <span>Send damage claims without photos to review</span>
        </label>
        <Button className="w-full" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save policy</Button>
      </div>
    </Card>
  );
}
