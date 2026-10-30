import { useState } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { ArrowRight, CheckCircle2, Clock, FileLock2, Fingerprint, KeyRound, LifeBuoy, Lock, Mail, ScrollText, Server, ShieldCheck, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/site";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { PageHero, SiteLayout } from "./SiteLayout";

// ───────────────────────── About ─────────────────────────

export function AboutPage() {
  return (
    <SiteLayout title="About">
      <PageHero
        eyebrow="About ReturnFlow"
        title={<>Returns are part of the purchase. <em className="italic text-kraft-ink">We make them feel like it.</em></>}
        intro="ReturnFlow started on a warehouse floor, watching a team track the same return across an inbox, a spreadsheet, a courier portal and a payment dashboard. We built one line for all of it."
      />
      <section className="max-w-[1100px] mx-auto px-5 sm:px-8 py-16 grid gap-12 lg:grid-cols-2">
        <div className="space-y-5 text-[16.5px] leading-[1.7] text-ink-2">
          <p>For a direct-to-consumer brand, a return is a second chance at the customer. Handled well, it builds the trust that brings them back. Handled badly, it costs the margin on the original sale and the next one.</p>
          <p>ReturnFlow gives shoppers a clean, branded way to send things back, and gives the people behind the counter — support, warehouse, finance — one shared view of every return, with automation for the routine and evidence for the exceptions.</p>
          <p>We design for teams that process dozens of returns a shift: fast screens, clear status colours, big tap targets on the warehouse floor, and nothing that makes you copy an order number between tabs.</p>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line border border-line rounded-[var(--radius-card)] overflow-hidden self-start [&>div]:bg-surface">
          {[
            ["One timeline", "From request to restock, every step in one place"],
            ["Five desks", "Support, warehouse, finance, managers and admins"],
            ["Evidence first", "Photos, checklists and grades behind every refund"],
            ["Your brand", "Portal and emails in your logo and colours"],
          ].map(([k, v]) => (
            <div key={k} className="p-5">
              <dt className="font-display text-[22px]">{k}</dt>
              <dd className="mt-1 text-[14px] text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="border-t border-line bg-surface">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-14 grid gap-8 md:grid-cols-3">
          {[
            ["Calm over clever", "Software for operations should be predictable. Every automated decision says why it was made."],
            ["People decide", "Rules and AI clear the routine. Anything that costs money or trust has a human on it."],
            ["Your data stays yours", "Isolated per store, exportable any time, never sold, never used for ads."],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="text-[17px] font-semibold">{t}</h3>
              <p className="mt-2 text-[15px] text-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="max-w-[1100px] mx-auto px-5 sm:px-8 py-16 text-center">
        <h2 className="font-display text-[34px] leading-tight">Talk to us about your returns</h2>
        <p className="mt-2 text-muted">We'll show you ReturnFlow running on your own orders.</p>
        <Link to="/contact" className="group mt-6 inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-ink text-white text-[15px] font-medium hover:bg-ink-2">Contact us <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link>
      </section>
    </SiteLayout>
  );
}

// ───────────────────────── Contact ─────────────────────────

const TOPICS = [
  ["sales", "Book a demo / pricing"],
  ["support", "Help with my account"],
  ["partnership", "Partnerships & integrations"],
  ["privacy", "Privacy or data request"],
  ["other", "Something else"],
] as const;

export function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", topic: "sales", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await api("/public/contact", { method: "POST", body: { ...form, company: form.company || undefined, website: form.website || undefined } });
      setStatus("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Couldn't send your message. Please email us instead."));
      setStatus("idle");
    }
  };

  return (
    <SiteLayout title="Contact us">
      <PageHero eyebrow="Contact" title={<>Let's talk <em className="italic text-kraft-ink">returns.</em></>} intro="Questions about ReturnFlow, a demo on your own orders, or help with your account — we usually reply within one business day." />
      <section className="max-w-[1100px] mx-auto px-5 sm:px-8 py-14 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[20px] border border-line bg-surface p-6 sm:p-8">
          {status === "sent" ? (
            <div className="text-center py-10 animate-rise">
              <CheckCircle2 className="mx-auto size-12 text-done" />
              <h2 className="mt-4 text-[22px] font-semibold">Message received</h2>
              <p className="mt-1 text-muted">Thanks, {form.name.split(" ")[0]}. We'll reply to {form.email} soon.</p>
              <button onClick={() => { setStatus("idle"); setForm({ ...form, message: "" }); }} className="mt-6 text-[14px] font-medium underline underline-offset-4">Send another message</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && !error.fields && <div className="rounded-lg bg-danger-bg text-danger text-[13.5px] px-3.5 py-2.5">{error.message}</div>}
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Your name" autoComplete="name" value={form.name} onChange={set("name")} error={error?.fieldError("name")} />
                <Input label="Work email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={error?.fieldError("email")} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="Company (optional)" autoComplete="organization" value={form.company} onChange={set("company")} />
                <Select label="What's it about?" value={form.topic} onChange={set("topic")}>
                  {TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <Textarea label="Message" value={form.message} onChange={set("message")} error={error?.fieldError("message")} className="[&_textarea]:min-h-[150px]" placeholder="Tell us about your store and how you handle returns today." />
              {/* Honeypot: hidden from people, filled by bots */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} className="absolute -left-[9999px] size-px opacity-0" aria-hidden />
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                <Button type="submit" size="lg" loading={status === "sending"}>Send message</Button>
                <p className="text-[12.5px] text-muted">By sending this you agree to our <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</p>
              </div>
            </form>
          )}
        </div>
        <aside className="space-y-4">
          {[
            { icon: Mail, title: "Sales & demos", body: "See ReturnFlow on your own orders.", link: COMPANY.email },
            { icon: LifeBuoy, title: "Customer support", body: "For teams already using ReturnFlow.", link: COMPANY.supportEmail },
            { icon: ShieldCheck, title: "Security", body: "Report a vulnerability responsibly.", link: COMPANY.securityEmail },
            { icon: FileLock2, title: "Privacy", body: "Data access or deletion requests.", link: COMPANY.privacyEmail },
          ].map((c) => (
            <div key={c.title} className="flex gap-3.5 rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <span className="grid place-items-center size-10 rounded-lg bg-paper-2 text-ink-2 shrink-0"><c.icon className="size-5" /></span>
              <div className="min-w-0">
                <div className="text-[14.5px] font-semibold">{c.title}</div>
                <div className="text-[13px] text-muted">{c.body}</div>
                <a href={`mailto:${c.link}`} className="text-[13.5px] font-medium underline underline-offset-2 decoration-line-strong hover:decoration-ink">{c.link}</a>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2.5 px-1 text-[13px] text-muted"><Clock className="size-4" /> Monday–Saturday, 10am–7pm IST</div>
          <p className="px-1 text-[13px] text-muted">Shopping with a store that uses ReturnFlow? Use the return link in your order email, or contact the store directly.</p>
        </aside>
      </section>
    </SiteLayout>
  );
}

// ───────────────────────── Security ─────────────────────────

export function SecurityPage() {
  const blocks = [
    { icon: Server, title: "Isolated per store", body: "Every order, return and customer is scoped to one business's workspace on the server. Requests for another workspace's records return nothing." },
    { icon: Users, title: "Role-based access", body: "Five roles — Admin, Manager, Support, Warehouse, Finance — each limited to what the job needs, enforced on every request, with instant revocation." },
    { icon: Lock, title: "Encryption", body: "HTTPS everywhere with HSTS. Store tokens, gateway keys, webhook and messaging secrets are encrypted at rest with AES-256-GCM." },
    { icon: FileLock2, title: "Private evidence", body: "Customer and inspection photos never live at public URLs. They are served only to signed-in staff of the same store, and uploads are checked to be real images." },
    { icon: KeyRound, title: "Account protection", body: "Passwords hashed with bcrypt, account lockout after repeated failures, session expiry, and changing a password signs out every other device." },
    { icon: Fingerprint, title: "Signed integrations", body: "Shopify webhooks are verified with HMAC. Order, courier and messaging webhooks are signed with replay protection. API keys are stored hashed." },
    { icon: ScrollText, title: "Full audit trail", body: "Approvals, rejections, rule overrides, refunds, inventory changes, exports and sign-ins are recorded with who, when and from where — exportable any time." },
    { icon: ShieldCheck, title: "Safe by default", body: "Strict security headers and content security policy, rate limiting on sign-in and public forms, and spreadsheet-safe CSV exports." },
  ];
  return (
    <SiteLayout title="Security">
      <PageHero eyebrow="Security" title={<>Refunds are money. <em className="italic text-kraft-ink">We treat them that way.</em></>} intro="How ReturnFlow protects your store's data, your customers' details, and every refund decision." />
      <section className="max-w-[1100px] mx-auto px-5 sm:px-8 py-14 grid gap-4 sm:grid-cols-2">
        {blocks.map((b) => (
          <div key={b.title} className={clsx("rounded-[var(--radius-card)] border border-line bg-surface p-6")}>
            <b.icon className="size-5 text-kraft-ink" />
            <h3 className="mt-3 text-[16.5px] font-semibold">{b.title}</h3>
            <p className="mt-1.5 text-[14.5px] text-muted leading-relaxed">{b.body}</p>
          </div>
        ))}
      </section>
      <section className="border-t border-line bg-surface">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-12 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-[20px] font-semibold">Backups & availability</h2>
            <p className="mt-2 text-[15px] text-muted leading-relaxed">Nightly encrypted backups of data and photos with a tested restore process, and a 99.5% monthly uptime target.</p>
          </div>
          <div>
            <h2 className="text-[20px] font-semibold">Responsible disclosure</h2>
            <p className="mt-2 text-[15px] text-muted leading-relaxed">Found a vulnerability? Email <a href={`mailto:${COMPANY.securityEmail}`} className="text-ink underline underline-offset-2">{COMPANY.securityEmail}</a> with details. We acknowledge reports within two business days and won't pursue good-faith research.</p>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
