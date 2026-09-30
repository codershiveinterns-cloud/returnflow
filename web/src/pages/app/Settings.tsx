import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Organization, Session } from "@/lib/domain";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { CopyButton } from "@/components/ui/misc";

const SWATCHES = ["#8a3b12", "#1f2a37", "#1d4d4f", "#3f3a8c", "#7a1f3d", "#2f5d34", "#b4540f", "#15171a"];

export function SettingsPage() {
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const org = session.organization;
  const [form, setForm] = useState({
    name: org.name,
    brandColor: org.brandColor,
    portalHeadline: org.portalHeadline ?? "",
    supportEmail: org.supportEmail ?? "",
    returnWindowDays: String(org.returnWindowDays),
    currency: org.currency,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const portalUrl = `${window.location.origin}/r/${org.slug}`;
  const dirty = form.name !== org.name || form.brandColor !== org.brandColor || form.portalHeadline !== (org.portalHeadline ?? "") || form.supportEmail !== (org.supportEmail ?? "") || form.returnWindowDays !== String(org.returnWindowDays) || form.currency !== org.currency;

  const applyOrg = (o: Organization) => qc.setQueryData<Session | null>(["session"], (s) => (s ? { ...s, organization: o } : s));

  const save = useMutation({
    mutationFn: () => api<Organization>("/settings/organization", { method: "PATCH", body: { ...form, returnWindowDays: Number(form.returnWindowDays) } }),
    onSuccess: (o) => {
      applyOrg(o);
      toast.success("Portal settings saved");
    },
  });
  const logo = useMutation({
    mutationFn: (file: File | null) => {
      if (!file) return api<Organization>("/settings/organization/logo", { method: "DELETE" });
      const fd = new FormData();
      fd.append("logo", file);
      return api<Organization>("/settings/organization/logo", { method: "POST", body: fd });
    },
    onSuccess: (o) => {
      applyOrg(o);
      toast.success("Logo updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const err = save.error instanceof ApiError ? save.error : null;

  useEffect(() => {
    if (fileRef.current) fileRef.current.value = "";
  }, [org.logoUrl]);

  return (
    <>
      <PageHeader
        title="Portal & brand"
        description="Your customers see this on the return portal. Changes go live as soon as you save."
        actions={<a href={portalUrl} target="_blank" rel="noreferrer"><Button variant="secondary" icon={<ExternalLink className="size-4" />}>Open portal</Button></a>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Portal link" description="Add this to your order confirmation emails, footer and help centre." />
            <div className="px-5 pb-5">
              <div className="flex items-center gap-2 rounded-lg bg-paper border border-line px-3 h-10">
                <code className="flex-1 truncate font-mono text-[12.5px]">{portalUrl}</code>
                <CopyButton value={portalUrl} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Brand" />
            <div className="px-5 pb-5 space-y-5">
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-xl border border-line grid place-items-center overflow-hidden bg-paper" style={!org.logoUrl ? { background: form.brandColor } : undefined}>
                  {org.logoUrl ? <img src={org.logoUrl} alt="Logo" className="size-full object-contain" /> : <span className="text-white text-[22px] font-semibold">{form.name[0]}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0])} />
                  <Button variant="secondary" size="sm" icon={<ImagePlus className="size-4" />} loading={logo.isPending} onClick={() => fileRef.current?.click()}>
                    {org.logoUrl ? "Replace logo" : "Upload logo"}
                  </Button>
                  {org.logoUrl && <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => logo.mutate(null)}>Remove</Button>}
                  <p className="w-full text-[12px] text-muted">Square PNG, JPG, WEBP or SVG, up to 1 MB.</p>
                </div>
              </div>
              <Input label="Store name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={err?.fieldError("name")} />
              <div>
                <div className="text-[13px] font-medium text-ink-2 mb-1.5">Brand colour</div>
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map((c) => (
                    <button key={c} onClick={() => setForm({ ...form, brandColor: c })} className="size-8 rounded-lg ring-offset-2 ring-offset-surface transition-shadow" style={{ background: c, boxShadow: form.brandColor.toLowerCase() === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }} aria-label={`Use ${c}`} />
                  ))}
                  <label className="flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-lg border border-line-strong cursor-pointer">
                    <input type="color" value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="size-6 rounded cursor-pointer border-0 bg-transparent p-0" />
                    <span className="font-mono text-[12px]">{form.brandColor}</span>
                  </label>
                </div>
                {err?.fieldError("brandColor") && <p className="mt-1 text-[12.5px] text-danger">{err.fieldError("brandColor")}</p>}
              </div>
              <Input label="Portal headline" placeholder="Returns & exchanges, made simple" value={form.portalHeadline} onChange={(e) => setForm({ ...form, portalHeadline: e.target.value })} maxLength={120} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Policy" description="Shown to customers. Automatic eligibility rules that enforce these arrive in Milestone 2." />
            <div className="px-5 pb-5 grid sm:grid-cols-3 gap-4">
              <Input label="Return window" type="number" min={1} max={365} value={form.returnWindowDays} onChange={(e) => setForm({ ...form, returnWindowDays: e.target.value })} trailing={<span className="text-[12px] text-muted pr-1">days</span>} error={err?.fieldError("returnWindowDays")} />
              <Select label="Default currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD"].map((c) => <option key={c}>{c}</option>)}
              </Select>
              <Input label="Support email" type="email" placeholder="care@yourstore.com" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} error={err?.fieldError("supportEmail")} />
            </div>
          </Card>

          <div className="flex justify-end gap-2 sticky bottom-4">
            {dirty && <Button variant="secondary" onClick={() => setForm({ name: org.name, brandColor: org.brandColor, portalHeadline: org.portalHeadline ?? "", supportEmail: org.supportEmail ?? "", returnWindowDays: String(org.returnWindowDays), currency: org.currency })}>Discard</Button>}
            <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>
          </div>
        </div>

        <div className="xl:sticky xl:top-8 h-fit">
          <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint mb-2">Live preview</div>
          <div className="rounded-[20px] border border-line bg-surface p-2 shadow-[var(--shadow-pop)]">
            <div className="rounded-[14px] overflow-hidden border border-line">
              <div className="px-5 pt-5 pb-8 text-white" style={{ background: form.brandColor }}>
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-md bg-white/15 grid place-items-center overflow-hidden text-[12px] font-semibold">{org.logoUrl ? <img src={org.logoUrl} alt="" className="size-full object-contain bg-white" /> : form.name[0]}</div>
                  <span className="text-[13px] font-semibold">{form.name}</span>
                </div>
                <div className="mt-6 font-display text-[22px] leading-tight">{form.portalHeadline || "Start a return"}</div>
                <div className="mt-1 text-[12px] text-white/75">Returns accepted within {form.returnWindowDays || "—"} days of delivery.</div>
              </div>
              <div className="-mt-4 mx-3 mb-4 rounded-xl bg-surface border border-line p-4 space-y-2.5 shadow-sm">
                <div className="h-9 rounded-md border border-line px-3 flex items-center text-[12px] text-faint">Order number</div>
                <div className="h-9 rounded-md border border-line px-3 flex items-center text-[12px] text-faint">Email or phone</div>
                <div className="h-9 rounded-md grid place-items-center text-[12.5px] font-medium text-white" style={{ background: form.brandColor }}>Find my order</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
