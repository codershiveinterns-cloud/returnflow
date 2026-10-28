import { useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Mail, MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { Badge, Code } from "@/components/ui/Badge";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Overlay";
import { Pagination } from "@/components/ui/misc";

type Row = { id: string; channel: string; to: string; template: string; templateLabel: string; subject: string | null; status: string; provider: string; error: string | null; createdAt: string; returnId: string | null; rma: string | null };
type Data = { total: number; page: number; pageSize: number; smtpConfigured: boolean; notifications: Row[] };

const STATUS: Record<string, [string, "done" | "progress" | "danger" | "neutral"]> = {
  sent: ["Delivered to mail server", "done"],
  logged: ["Recorded", "progress"],
  failed: ["Failed", "danger"],
  skipped: ["Skipped", "neutral"],
};

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["notifications", page], queryFn: () => api<Data>(`/notifications?page=${page}&pageSize=30`), placeholderData: keepPreviousData });
  const preview = useQuery({ queryKey: ["notification", open], queryFn: () => api<{ html: string; subject: string; to: string; createdAt: string }>(`/notifications/${open}`), enabled: !!open });

  return (
    <>
      <PageHeader title="Notifications" description="Every email sent to customers when a return changes status — received, approved, rejected, pickup scheduled, picked up and received at the warehouse." />
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
                  <th className="font-medium px-3">Email</th>
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
                      <div className="truncate max-w-[340px]">{n.subject}</div>
                      <div className="text-[12px] text-faint">{n.templateLabel}</div>
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
