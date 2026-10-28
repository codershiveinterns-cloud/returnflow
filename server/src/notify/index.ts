import nodemailer, { type Transporter } from "nodemailer";
import { db } from "../db.js";
import { env } from "../env.js";
import { rma } from "../routes/shared.js";
import { render, type TemplateKey, type TemplateVars } from "./templates.js";

/**
 * Notification framework.
 *
 * Email is sent through SMTP when SMTP_URL is configured (any provider —
 * SES, Postmark, SendGrid, Gmail). Without it, messages are rendered and
 * recorded in the outbox with status "logged" so the flow can be verified
 * end to end. Every message is stored either way.
 */
let transporter: Transporter | null | undefined;
function mailer() {
  if (transporter !== undefined) return transporter;
  transporter = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return transporter;
}

export async function notifyReturn(returnId: string, key: TemplateKey, extra: Partial<TemplateVars> = {}) {
  const r = await db.returnRequest.findUnique({
    where: { id: returnId },
    include: { organization: true, customer: true, order: { select: { orderNumber: true } } },
  });
  if (!r) return;
  const org = r.organization;
  const vars: TemplateVars = {
    storeName: org.name,
    brandColor: org.brandColor,
    customerName: r.customer.name ?? "",
    rma: rma(r.number),
    orderNumber: r.order.orderNumber,
    trackUrl: `${env.APP_URL}/r/${org.slug}/track?rma=${rma(r.number)}`,
    supportEmail: org.supportEmail,
    resolution: { refund: "refund", store_credit: "store credit", replacement: "replacement" }[r.resolution],
    ...extra,
  };
  const msg = render(key, vars);
  const to = r.customer.email;
  const base = { organizationId: org.id, returnId: r.id, channel: "email", to, template: key, subject: msg.subject, body: msg.html };

  if (to.endsWith(".invalid")) {
    await db.notification.create({ data: { ...base, status: "skipped", provider: "none", error: "Customer has no email address" } });
    return;
  }
  const transport = mailer();
  if (!transport) {
    await db.notification.create({ data: { ...base, status: "logged", provider: "log", sentAt: new Date() } });
    return;
  }
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? `${org.name} <returns@${new URL(env.APP_URL).hostname}>`,
      replyTo: org.supportEmail ?? undefined,
      to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    await db.notification.create({ data: { ...base, status: "sent", provider: "smtp", sentAt: new Date() } });
  } catch (err) {
    await db.notification.create({ data: { ...base, status: "failed", provider: "smtp", error: err instanceof Error ? err.message : "Send failed" } });
  }
}

/** Fire-and-forget wrapper: notification failures must never break a workflow action. */
export function queueNotification(returnId: string, key: TemplateKey, extra?: Partial<TemplateVars>) {
  const p = notifyReturn(returnId, key, extra).catch((e) => console.error("notification failed", e));
  pending.add(p);
  p.finally(() => pending.delete(p));
}

const pending = new Set<Promise<unknown>>();
/** Used by tests (and graceful shutdown) to wait for queued notifications. */
export const flushNotifications = () => Promise.all([...pending]);
