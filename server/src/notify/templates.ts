/**
 * Customer notification templates, one per key status change. Each renders
 * a subject, a plain-text body (also used for SMS/WhatsApp) and branded HTML.
 */
export type TemplateVars = {
  storeName: string;
  brandColor: string;
  customerName: string;
  rma: string;
  orderNumber: string;
  trackUrl: string;
  supportEmail?: string | null;
  reason?: string;
  courier?: string;
  awb?: string;
  pickupDate?: string;
  pickupWindow?: string;
  amount?: string;
  resolution?: string;
  reference?: string;
};

export const TEMPLATES = {
  requested: { label: "Request received" },
  approved: { label: "Return approved" },
  rejected: { label: "Return not approved" },
  pickup_scheduled: { label: "Pickup scheduled" },
  in_transit: { label: "Parcel picked up" },
  received: { label: "Received at warehouse" },
  inspected: { label: "Inspection complete" },
  refunded: { label: "Refund issued" },
  store_credit: { label: "Store credit issued" },
  replaced: { label: "Replacement shipped" },
} as const;
export type TemplateKey = keyof typeof TEMPLATES;

function content(key: TemplateKey, v: TemplateVars): { subject: string; lines: string[] } {
  const hi = `Hi ${v.customerName.split(" ")[0] || "there"},`;
  switch (key) {
    case "requested":
      return { subject: `We've received your return request ${v.rma}`, lines: [hi, `Thanks — we've received your return request for order #${v.orderNumber}. Our team will review it shortly and email you the next steps.`] };
    case "approved":
      return { subject: `Your return ${v.rma} is approved`, lines: [hi, `Good news: your return for order #${v.orderNumber} has been approved.`, `We'll arrange a courier pickup and email you the date and tracking number. Please keep the items packed with their tags.`] };
    case "rejected":
      return { subject: `Update on your return ${v.rma}`, lines: [hi, `We're sorry, but we can't accept the return for order #${v.orderNumber}.`, v.reason ? `Reason: ${v.reason}` : "", `If you think this is a mistake, just reply to this email.`] };
    case "pickup_scheduled":
      return { subject: `Pickup scheduled for ${v.rma}`, lines: [hi, `A courier will collect your parcel${v.pickupDate ? ` on ${v.pickupDate}` : ""}${v.pickupWindow ? ` (${v.pickupWindow})` : ""}.`, `Courier: ${v.courier} · Tracking number: ${v.awb}`, `Please hand over the items packed securely with the return number ${v.rma} written on the parcel.`] };
    case "in_transit":
      return { subject: `Your return ${v.rma} is on its way`, lines: [hi, `The courier has picked up your parcel. It's on its way to our warehouse.`, `${v.courier} tracking number: ${v.awb}`] };
    case "received":
      return { subject: `We've received your return ${v.rma}`, lines: [hi, `Your parcel has arrived at our warehouse. We'll inspect the items and process your ${v.resolution ?? "return"} shortly.`] };
    case "inspected":
      return { subject: `Inspection complete for ${v.rma}`, lines: [hi, `We've inspected the items from your return. Your ${v.resolution ?? "resolution"} is being processed now.`] };
    case "refunded":
      return { subject: `Refund issued for ${v.rma}`, lines: [hi, `We've issued a refund of ${v.amount} for your return.`, v.reference ? `Reference: ${v.reference}` : "", `Depending on your bank it can take 5–7 business days to appear.`] };
    case "store_credit":
      return { subject: `Store credit added for ${v.rma}`, lines: [hi, `We've added ${v.amount} in store credit for your return.`, v.reference ? `Your credit code: ${v.reference}` : ""] };
    case "replaced":
      return { subject: `Replacement on its way for ${v.rma}`, lines: [hi, `Your replacement has been dispatched.`, v.reference ? `Replacement order: ${v.reference}` : ""] };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function render(key: TemplateKey, v: TemplateVars) {
  const { subject, lines } = content(key, v);
  const body = lines.filter(Boolean);
  const text = [...body, "", `Track your return: ${v.trackUrl}`, "", `— ${v.storeName}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15171a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e3dfd6;border-radius:14px;overflow:hidden">
<tr><td style="background:${esc(v.brandColor)};color:#fff;padding:20px 28px;font-size:16px;font-weight:600">${esc(v.storeName)}</td></tr>
<tr><td style="padding:28px">
<div style="font-family:Menlo,monospace;font-size:12px;color:#6b6860;letter-spacing:.08em">RETURN ${esc(v.rma)}</div>
<h1 style="font-size:20px;margin:6px 0 18px">${esc(TEMPLATES[key].label)}</h1>
${body.map((l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${esc(l)}</p>`).join("")}
<p style="margin:22px 0 0"><a href="${esc(v.trackUrl)}" style="display:inline-block;background:${esc(v.brandColor)};color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-size:14px;font-weight:600">Track your return</a></p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #efece5;font-size:12px;color:#9a968c">${v.supportEmail ? `Questions? Reply to this email or write to ${esc(v.supportEmail)}.` : "Questions? Just reply to this email."}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
