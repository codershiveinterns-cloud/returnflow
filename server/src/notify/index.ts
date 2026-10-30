import nodemailer, { type Transporter } from "nodemailer";
import { db } from "../db.js";
import { env } from "../env.js";
import { rma } from "../routes/shared.js";
import { render, TEMPLATES, type TemplateKey, type TemplateVars } from "./templates.js";
import { decrypt, hmacSha256 } from "../lib/crypto.js";
import { parseList } from "../returns/eligibility.js";
import { assertPublicUrl } from "../lib/netguard.js";

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

  await sendMessagingHook(org, r.id, r.customer.phone, key, `${org.name}: ${TEMPLATES[key].label} for return ${vars.rma}. Track: ${vars.trackUrl}`, vars.rma);

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

/**
 * SMS / WhatsApp hook. ReturnFlow POSTs a signed JSON message to the
 * merchant's messaging endpoint (their Twilio / Gupshup / Interakt / MSG91
 * relay), once per enabled channel. Signed like the order webhook:
 *   X-ReturnFlow-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
 */
type HookOrg = { id: string; name: string; messagingHookUrl: string | null; messagingHookSecretEnc: string | null; messagingChannels: string };

export async function sendMessagingHook(org: HookOrg, returnId: string | null, phone: string | null, template: string, text: string, rmaLabel?: string) {
  const channels = parseList(org.messagingChannels).filter((c) => c === "sms" || c === "whatsapp");
  if (!org.messagingHookUrl || !org.messagingHookSecretEnc || !channels.length) return [];
  const results: { channel: string; status: string; error?: string }[] = [];
  for (const channel of channels) {
    const base = { organizationId: org.id, returnId, channel, to: phone ?? "", template, subject: null, body: text, provider: "webhook" };
    if (!phone) {
      await db.notification.create({ data: { ...base, status: "skipped", error: "Customer has no phone number" } });
      results.push({ channel, status: "skipped" });
      continue;
    }
    const body = JSON.stringify({ type: "notification", channel, to: phone, template, text, rma: rmaLabel ?? null, store: org.name, sentAt: new Date().toISOString() });
    const t = Math.floor(Date.now() / 1000);
    try {
      await assertPublicUrl(org.messagingHookUrl); // re-checked at send time (DNS can change)
      const res = await fetch(org.messagingHookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-ReturnFlow-Signature": `t=${t},v1=${hmacSha256(decrypt(org.messagingHookSecretEnc), `${t}.${body}`)}` },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error("The messaging hook didn't accept the message");
      await db.notification.create({ data: { ...base, status: "sent", sentAt: new Date() } });
      results.push({ channel, status: "sent" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Hook failed";
      await db.notification.create({ data: { ...base, status: "failed", error } });
      results.push({ channel, status: "failed", error });
    }
  }
  return results;
}
