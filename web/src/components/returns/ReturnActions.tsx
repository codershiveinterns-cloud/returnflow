import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, CornerUpRight, Lock, MapPin, Truck, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { CHECKPOINTS, COURIERS, REJECT_REASONS } from "@/lib/domain";
import { useCan } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";

export type ActionableReturn = { id: string; rma: string; status: string; requiresManager: boolean; customer: { name: string | null } };

type Dialog = null | "approve" | "reject" | "escalate" | "pickup" | "tracking" | "override";

/** Context-aware action bar for a return, shown at the bottom of the detail drawer. */
export function ReturnActions({ ret }: { ret: ActionableReturn }) {
  const can = useCan();
  const [open, setOpen] = useState<Dialog>(null);
  const managerOnly = ret.requiresManager && !can("returns:decide_escalated");

  let bar: React.ReactNode = null;
  if (ret.status === "requested" && can("returns:decide")) {
    bar = managerOnly ? (
      <div className="flex items-center gap-2 text-[13.5px] text-muted">
        <Lock className="size-4" /> Waiting for a manager to decide
      </div>
    ) : (
      <>
        <Button icon={<Check className="size-4" />} onClick={() => setOpen("approve")}>Approve</Button>
        <Button variant="danger" icon={<X className="size-4" />} onClick={() => setOpen("reject")}>Reject</Button>
        {!ret.requiresManager && <Button variant="ghost" icon={<CornerUpRight className="size-4" />} onClick={() => setOpen("escalate")}>Escalate</Button>}
      </>
    );
  } else if (ret.status === "rejected" && can("returns:decide_escalated")) {
    bar = <Button variant="secondary" icon={<ArrowUpRight className="size-4" />} onClick={() => setOpen("override")}>Override &amp; approve</Button>;
  } else if (ret.status === "approved" && can("pickups:manage")) {
    bar = <Button icon={<Truck className="size-4" />} onClick={() => setOpen("pickup")}>Schedule pickup</Button>;
  } else if ((ret.status === "pickup_scheduled" || ret.status === "in_transit") && can("pickups:manage")) {
    bar = <Button icon={<MapPin className="size-4" />} onClick={() => setOpen("tracking")}>Update tracking</Button>;
  }
  if (!bar) return null;

  return (
    <>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 backdrop-blur px-6 py-3.5">{bar}</div>
      {open === "approve" && <DecisionModal ret={ret} kind="approve" onClose={() => setOpen(null)} />}
      {open === "override" && <DecisionModal ret={ret} kind="override" onClose={() => setOpen(null)} />}
      {open === "reject" && <RejectModal ret={ret} onClose={() => setOpen(null)} />}
      {open === "escalate" && <DecisionModal ret={ret} kind="escalate" onClose={() => setOpen(null)} />}
      {open === "pickup" && <PickupModal ret={ret} onClose={() => setOpen(null)} />}
      {open === "tracking" && <TrackingModal ret={ret} onClose={() => setOpen(null)} />}
    </>
  );
}

function useAction(ret: ActionableReturn, path: string, success: string, onClose: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: object) => api(`/returns/${ret.id}/${path}`, { method: "POST", body }),
    onSuccess: () => {
      toast.success(success);
      ["returns", "return", "dashboard", "pickups", "notifications"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
  });
}

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="rounded-lg bg-danger-bg text-danger text-[13px] px-3.5 py-2.5">{error instanceof ApiError ? error.message : "Something went wrong"}</div>;
}

function DecisionModal({ ret, kind, onClose }: { ret: ActionableReturn; kind: "approve" | "escalate" | "override"; onClose: () => void }) {
  const [note, setNote] = useState("");
  const m = useAction(ret, kind === "escalate" ? "escalate" : "approve", kind === "escalate" ? `${ret.rma} sent to a manager` : `${ret.rma} approved — customer notified`, onClose);
  const copy = {
    approve: { title: `Approve ${ret.rma}?`, desc: `${ret.customer.name ?? "The customer"} will get an email that the return is approved, and it moves to pickup.`, cta: "Approve return", label: "Note (optional)" },
    override: { title: `Override and approve ${ret.rma}?`, desc: "This reverses the rejection. The override is recorded in the audit log with your name.", cta: "Override & approve", label: "Reason for override" },
    escalate: { title: `Escalate ${ret.rma} to a manager?`, desc: "Only managers and admins will be able to approve or reject it.", cta: "Escalate", label: "What should the manager know?" },
  }[kind];
  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={copy.desc}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending} onClick={() => m.mutate({ note: note || undefined })}>{copy.cta}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorNote error={m.error} />
        <Textarea label={copy.label} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}

function RejectModal({ ret, onClose }: { ret: ActionableReturn; onClose: () => void }) {
  const [reason, setReason] = useState("used_or_damaged");
  const [note, setNote] = useState("");
  const m = useAction(ret, "reject", `${ret.rma} rejected — customer notified`, onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${ret.rma}?`}
      description="The customer receives an email with the reason you choose."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate({ reason, note: note || undefined })}>Reject return</Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={m.error} />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          {Object.entries(REJECT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Textarea label={reason === "other" ? "Describe the reason" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}

function PickupModal({ ret, onClose }: { ret: ActionableReturn; onClose: () => void }) {
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const [form, setForm] = useState({ courier: "Delhivery", awb: "", scheduledFor: tomorrow, pickupWindow: "10am – 2pm" });
  const m = useAction(ret, "pickup", `Pickup scheduled for ${ret.rma}`, onClose);
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Schedule pickup · ${ret.rma}`}
      description="Book the pickup with your courier, then record it here. The customer gets the date and tracking number."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending} onClick={() => m.mutate(form)}>Schedule pickup</Button>
        </>
      }
    >
      <div className="space-y-4">
        {err && !err.fields && <ErrorNote error={err} />}
        <div className="grid sm:grid-cols-2 gap-4">
          <Select label="Courier" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
            {COURIERS.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Input label="AWB / tracking number" value={form.awb} onChange={(e) => setForm({ ...form, awb: e.target.value.toUpperCase() })} error={err?.fieldError("awb")} placeholder="e.g. 7751093244" inputClassName="font-mono" />
          <Input label="Pickup date" type="date" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
          <Select label="Time window" value={form.pickupWindow} onChange={(e) => setForm({ ...form, pickupWindow: e.target.value })}>
            {["10am – 2pm", "2pm – 6pm", "Any time"].map((w) => <option key={w}>{w}</option>)}
          </Select>
        </div>
      </div>
    </Modal>
  );
}

function TrackingModal({ ret, onClose }: { ret: ActionableReturn; onClose: () => void }) {
  const [form, setForm] = useState({ status: ret.status === "pickup_scheduled" ? "picked_up" : "delivered", location: "", note: "" });
  const m = useAction(ret, "tracking", `Tracking updated for ${ret.rma}`, onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Update tracking · ${ret.rma}`}
      description="Couriers connected by webhook update this automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending} onClick={() => m.mutate({ status: form.status, location: form.location || undefined, note: form.note || undefined })}>Save update</Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote error={m.error} />
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {Object.entries(CHECKPOINTS).filter(([k]) => k !== "scheduled").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input label="Location (optional)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bhiwandi DC" />
        <Input label="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </div>
    </Modal>
  );
}
