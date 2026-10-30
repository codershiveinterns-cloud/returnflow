import { useEffect, useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Mail, MailCheck, MessageSquare, Send } from "lucide-react";
import clsx from "clsx";
import { ApiError, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { CopyButton, Pagination } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { Badge, Code } from "@/components/ui/Badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Overlay";

type Row = { id: string; channel: string; to: string; template: string; templateLabel: string; subject: string | null; status: string; provider: string; error: string | null; createdAt: string; returnId: string | null; rma: string | null };
type Data = { total: number; page: number; pageSize: number; smtpConfigured: boolean; notifications: Row[] };

const STATUS: Record<string, [string, "done" | "progress" | "danger" | "neutral"]> = {
  sent: ["Sent", "done"],
  logged: ["Recorded", "progress"],
  failed: ["Failed", "danger"],
  skipped: ["Skipped", "neutral"],
};

export function NotificationsPage() {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["notifications", page], queryFn: () => api<Data>(`/notifications?page=${page}&pageSize=30`), placeholderData: keepPreviousData });
  const preview = useQuery({ queryKey: ["notification", open], queryFn: () => api<{ html: string; subject: string; to: string; createdAt: string }>(`/notifications/${open}`), enabled: !!open });

  return (
    <>
      <PageHeader title="Notifications" description="Every message sent to customers when a return changes status — by email, and by SMS or WhatsApp through your messaging provider." />
      {can("settings:manage") && <MessagingCard />}
      {data && !data.smtpConfigured && (
        <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-[13.5px]">
          <MailCheck className="size-4 text-progress mt-0.5 shrink-0" />
          <span className="text-ink-2">Emails are being recorded here. Add your mail server (<Code>SMTP_URL</Code>) to deliver them to customers' inboxes.</span>
        </div>
      )}
      <Card className="overflow-hidden">
        {!data ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.notifications.length === 0 ? (
          <EmptyState icon={<Mail className="size-5" />} title="No emails yet">They'll appear as returns move through the workflow.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead className="bg-paper/60 border-b border-line">
                <tr className="text-left text-[12px] text-muted">
                  <th className="font-medium pl-5 pr-3 h-10">Sent</th>
                  <th className="font-medium px-3">Message</th>
                  <th className="font-medium px-3">To</th>
                  <th className="font-medium px-3">Return</th>
                  <th className="font-medium pl-3 pr-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.notifications.map((n) => (
                  <tr key={n.id} onClick={() => setOpen(n.id)} className="cursor-pointer hover:bg-paper/60">
                    <td className="pl-5 pr-3 h-12 text-muted whitespace-nowrap">{dateTime(n.createdAt)}</td>
                    <td className="px-3">
                      <div className="truncate max-w-[340px]">{n.subject ?? n.templateLabel}</div>
                      <div className="text-[12px] text-faint">{n.channel === "email" ? "Email" : n.channel === "sms" ? "SMS" : "WhatsApp"} · {n.templateLabel}{n.error ? ` · ${n.error}` : ""}</div>
                    </td>
                    <td className="px-3 text-ink-2 truncate max-w-[220px]">{n.to}</td>
                    <td className="px-3">{n.returnId && <Link onClick={(e) => e.stopPropagation()} to={`/app/returns?open=${n.returnId}`} className="font-mono text-[12px] underline decoration-line-strong underline-offset-2 hover:decoration-ink">{n.rma}</Link>}</td>
                    <td className="pl-3 pr-5"><Badge tone={STATUS[n.status]?.[1] ?? "neutral"}>{STATUS[n.status]?.[0] ?? n.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} size="lg" title={preview.data?.subject ?? "Email"} description={preview.data ? `To ${preview.data.to} · ${dateTime(preview.data.createdAt)}` : undefined}>
        {preview.data ? <iframe title="Email preview" srcDoc={preview.data.html} sandbox="" className="w-full h-[480px] rounded-lg border border-line bg-paper" /> : <Skeleton className="h-[480px]" />}
      </Modal>
    </>
  );
}

type Messaging = { url: string | null; channels: string[]; secretPreview: string | null };

function MessagingCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["messaging"], queryFn: () => api<Messaging>("/settings/messaging") });
  const [form, setForm] = useState({ url: "", channels: [] as string[] });
  const [secret, setSecret] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  useEffect(() => { if (data) setForm({ url: data.url ?? "", channels: data.channels }); }, [data]);
  const save = useMutation({
    mutationFn: () => api<Messaging>("/settings/messaging", { method: "PUT", body: form }),
    onSuccess: () => { toast.success("Messaging settings saved"); qc.invalidateQueries({ queryKey: ["messaging"] }); },
  });
  const test = useMutation({
    mutationFn: () => api<{ results: { channel: string; status: string; error?: string }[] }>("/settings/messaging/test", { method: "POST", body: { phone } }),
    onSuccess: (r) => {
      const failed = r.results.filter((x) => x.status !== "sent");
      failed.length ? toast.error(`${failed[0].channel}: ${failed[0].error ?? failed[0].status}`) : toast.success(`Test sent on ${r.results.map((x) => x.channel).join(" & ")}`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reveal = useMutation({ mutationFn: () => api<{ secret: string }>("/settings/messaging/reveal", { method: "POST" }), onSuccess: (r) => setSecret(r.secret) });
  const err = save.error instanceof ApiError ? save.error : null;
  const dirty = data && (form.url !== (data.url ?? "") || JSON.stringify(form.channels) !== JSON.stringify(data.channels));
  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-[300px] shrink-0">
          <div className="flex items-center gap-2 text-[14px] font-semibold"><MessageSquare className="size-4 text-muted" /> SMS & WhatsApp</div>
          <p className="mt-1 text-[13px] text-muted">ReturnFlow sends each update as a signed webhook to your messaging provider (Twilio, Gupshup, Interakt, MSG91…), which delivers it to the customer's phone.</p>
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          {err && !err.fields && <div className="rounded-lg bg-danger-bg text-danger text-[13px] px-3.5 py-2.5">{err.message}</div>}
          <Input label="Hook URL" placeholder="https://your-relay.example.com/returnflow" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} error={err?.fieldError("url")} />
          <div className="flex flex-wrap items-center gap-2">
            {["sms", "whatsapp"].map((c) => {
              const on = form.channels.includes(c);
              return (
                <button key={c} onClick={() => setForm({ ...form, channels: on ? form.channels.filter((x) => x !== c) : [...form.channels, c] })} className={clsx("h-9 px-3.5 rounded-lg border text-[13.5px] font-medium transition-colors", on ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:bg-paper")}>
                  {on ? "✓ " : ""}{c === "sms" ? "SMS" : "WhatsApp"}
                </button>
              );
            })}
            <Button className="ml-auto" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
          </div>
          {data?.secretPreview && (
            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <div className="flex items-center gap-2 rounded-lg bg-paper border border-line px-3 h-10 min-w-0">
                <code className="flex-1 truncate font-mono text-[12px]">{secret ?? data.secretPreview}</code>
                {secret ? <CopyButton value={secret} /> : <button onClick={() => reveal.mutate()} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12.5px] font-medium hover:bg-paper-2"><Eye className="size-3.5" /> Signing secret</button>}
              </div>
              <div className="flex gap-2">
                <Input className="flex-1" aria-label="Test phone number" placeholder="+91 98000 00000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button variant="secondary" icon={<Send className="size-4" />} loading={test.isPending} disabled={!data.url || !data.channels.length} onClick={() => test.mutate()}>Test</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
