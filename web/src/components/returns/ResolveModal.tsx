import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CreditCard, Gift, RefreshCcw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { useToast } from "@/components/ui/Toast";

export type Resolvable = {
  id: string;
  rma: string;
  resolution: string;
  valueMinor: number;
  currency: string;
  paymentMethod: string;
  hasPaymentRef: boolean;
  grades?: string[];
};

const KINDS = [
  { id: "refund", label: "Refund", icon: CreditCard },
  { id: "store_credit", label: "Store credit", icon: Gift },
  { id: "replacement", label: "Replacement", icon: RefreshCcw },
] as const;

export function ResolveModal({ ret, onClose }: { ret: Resolvable; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<string>(ret.resolution);
  const [method, setMethod] = useState<"razorpay" | "manual">(ret.hasPaymentRef ? "razorpay" : "manual");
  const full = ret.valueMinor / 100;
  const worstGrade = (ret.grades ?? []).sort().at(-1);
  const [amount, setAmount] = useState(String(full));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const m = useMutation({
    mutationFn: () =>
      api<{ reference: string | null; gatewayMode: string | null }>(`/returns/${ret.id}/resolve`, {
        method: "POST",
        body: {
          kind,
          method: kind === "refund" ? method : kind,
          amount: kind === "replacement" ? undefined : Number(amount),
          reference: reference || undefined,
          note: note || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(kind === "replacement" ? `${ret.rma} marked as replaced` : `${kind === "store_credit" ? "Store credit" : "Refund"} issued for ${ret.rma}${r.reference ? ` · ${r.reference}` : ""}`);
      ["returns", "return", "refunds", "dashboard", "inventory"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
  });
  const err = m.error instanceof ApiError ? m.error : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Resolve ${ret.rma}`}
      description={`Customer asked for ${ret.resolution === "store_credit" ? "store credit" : ret.resolution === "replacement" ? "a replacement" : "a refund"}. Return value ${money(ret.valueMinor, ret.currency)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            {kind === "replacement" ? "Mark as replaced" : kind === "store_credit" ? `Issue ${money(Number(amount || 0) * 100, ret.currency)} credit` : `Refund ${money(Number(amount || 0) * 100, ret.currency)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {err && <div className="rounded-lg bg-danger-bg text-danger text-[13px] px-3.5 py-2.5">{err.message}</div>}
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => setKind(k.id)} className={clsx("flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 text-[13px] font-medium transition-colors", kind === k.id ? "border-ink bg-paper" : "border-line hover:border-line-strong text-ink-2")}>
              <k.icon className="size-5" />
              {k.label}
            </button>
          ))}
        </div>

        {kind !== "replacement" && (
          <div>
            <Input label="Amount" type="number" min={0} max={full} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} trailing={<span className="text-[12px] text-muted pr-1">{ret.currency}</span>} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[["Full", 1], ["75%", 0.75], ["50%", 0.5]].map(([l, f]) => (
                <button key={String(l)} onClick={() => setAmount(String(Math.round(full * Number(f) * 100) / 100))} className="h-7 px-2.5 rounded-md border border-line text-[12.5px] hover:border-line-strong">{l}</button>
              ))}
              {worstGrade && worstGrade > "A" && <span className="text-[12.5px] text-muted self-center ml-1">Inspection grade {worstGrade} — consider a partial amount</span>}
            </div>
          </div>
        )}

        {kind === "refund" && (
          <div>
            <div className="text-[13px] font-medium text-ink-2 mb-1.5">Refund through</div>
            <div className="grid sm:grid-cols-2 gap-2">
              <button disabled={!ret.hasPaymentRef} onClick={() => setMethod("razorpay")} className={clsx("text-left rounded-xl border-2 px-3.5 py-3 transition-colors disabled:opacity-50", method === "razorpay" ? "border-ink bg-paper" : "border-line hover:border-line-strong")}>
                <div className="text-[13.5px] font-medium">Razorpay</div>
                <div className="text-[12px] text-muted">{ret.hasPaymentRef ? "Back to the original payment" : "No online payment on this order"}</div>
              </button>
              <button onClick={() => setMethod("manual")} className={clsx("text-left rounded-xl border-2 px-3.5 py-3 transition-colors", method === "manual" ? "border-ink bg-paper" : "border-line hover:border-line-strong")}>
                <div className="text-[13.5px] font-medium">Bank / UPI transfer</div>
                <div className="text-[12px] text-muted">{ret.paymentMethod === "cod" ? "For cash-on-delivery orders" : "Record a transfer you made"}</div>
              </button>
            </div>
            {method === "manual" && <Input className="mt-3" label="Transaction reference" placeholder="UTR / UPI reference" value={reference} onChange={(e) => setReference(e.target.value)} inputClassName="font-mono" />}
          </div>
        )}
        {kind === "store_credit" && <p className="text-[13px] text-muted">A credit code is generated and emailed to the customer.</p>}
        {kind === "replacement" && <Input label="Replacement order number" placeholder="e.g. 10342" value={reference} onChange={(e) => setReference(e.target.value)} inputClassName="font-mono" />}
        <Textarea label="Internal note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="[&_textarea]:min-h-14" />
      </div>
    </Modal>
  );
}
