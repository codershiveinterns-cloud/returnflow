import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import { COMPANY } from "@/lib/site";
import { PageHero, SiteLayout } from "./SiteLayout";

type Section = { id: string; title: string; body: ReactNode };

function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: ReactNode; sections: Section[] }) {
  const [active, setActive] = useState(sections[0].id);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-20% 0px -70% 0px" });
    sections.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [sections]);
  return (
    <SiteLayout title={title}>
      <PageHero eyebrow={eyebrow} title={title} intro={<>{intro}<span className="block mt-3 text-[14px] text-faint">Last updated {COMPANY.lastUpdated}</span></>} />
      <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-14 grid gap-12 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block" aria-label="On this page">
          <ol className="sticky top-24 space-y-1 border-l border-line">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={clsx("block -ml-px border-l-2 pl-4 py-1 text-[13.5px] transition-colors", active === s.id ? "border-ink text-ink font-medium" : "border-transparent text-muted hover:text-ink")}>
                  <span className="font-mono text-[11px] text-faint mr-2">{String(i + 1).padStart(2, "0")}</span>{s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="min-w-0 max-w-[720px] space-y-12">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="flex items-baseline gap-3 text-[22px] font-semibold tracking-[-0.01em]"><span className="font-mono text-[12px] text-kraft-ink">{String(i + 1).padStart(2, "0")}</span>{s.title}</h2>
              <div className="mt-4 space-y-4 text-[15.5px] leading-[1.7] text-ink-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-ink [&_strong]:font-semibold">{s.body}</div>
            </section>
          ))}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 text-[14px] text-muted">
            Questions about this page? <Link to="/contact" className="text-ink font-medium underline underline-offset-2">Contact us</Link> or write to <a href={`mailto:${COMPANY.email}`} className="text-ink underline underline-offset-2">{COMPANY.email}</a>.
          </div>
        </article>
      </div>
    </SiteLayout>
  );
}

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

export function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={`How ${COMPANY.product} collects, uses and protects personal data — for the businesses that use it, and for the shoppers who return items through it.`}
      sections={[
        { id: "who", title: "Who we are", body: <><p>{COMPANY.product} provides software that helps online stores manage product returns: a customer return portal, a staff console, and integrations with stores, couriers and payment providers.</p><p><strong>For store data</strong> (orders, customers, returns), the store using {COMPANY.product} is the data controller and we act as its processor, handling that data only on its instructions. <strong>For account and website data</strong> (people who sign up, visit our site or contact us), {COMPANY.legalName} is the controller.</p></> },
        { id: "collect", title: "What we collect", body: <ul><li><strong>Account data</strong> — staff names, work email addresses, hashed passwords, roles and sign-in activity.</li><li><strong>Order data</strong> synced by the store — order numbers, items, prices, customer names, email addresses, phone numbers and delivery city/address.</li><li><strong>Return data</strong> — return reasons and descriptions, photos uploaded by customers and warehouse staff, inspection results, pickup and tracking details, and refund references.</li><li><strong>Contact-form data</strong> — your name, email, company and message.</li><li><strong>Technical data</strong> — IP address and request logs for security, and a strictly necessary session cookie.</li></ul> },
        { id: "use", title: "How we use it", body: <><ul><li>To run the service: process return requests, send status updates to customers, issue refunds through the store's payment provider, and keep inventory in sync.</li><li>To keep it secure: authentication, rate limiting, fraud and abuse detection, and a tamper-evident audit log.</li><li>To support customers and respond to enquiries.</li><li>To produce analytics for the store about its own returns.</li></ul><p>We do not sell personal data, use it for advertising, or train general-purpose AI models on it.</p></> },
        { id: "ai", title: "AI-assisted features", body: <p>If a store enables AI analysis, return reasons and photos may be sent to our AI provider (Anthropic) to classify reasons and suggest a condition grade. Suggestions are advisory — staff make every decision. Data is sent only for that request and is not used by the provider to train its models under our commercial terms.</p> },
        { id: "share", title: "Who we share it with", body: <><p>Only the service providers needed to run {COMPANY.product}, under contracts that require them to protect the data:</p><ul><li>Hosting and storage providers (servers, database, encrypted backups)</li><li>Email, SMS and WhatsApp delivery providers chosen by the store</li><li>Payment gateways (e.g. Razorpay) — only refund amounts and payment references</li><li>Store platforms and couriers the store connects (e.g. Shopify)</li><li>AI provider, only when the store enables AI analysis</li></ul><p>We may disclose data if required by law, and will tell the affected store where we lawfully can.</p></> },
        { id: "retention", title: "How long we keep it", body: <p>Store data is kept while the store's account is active and deleted within 90 days of account closure, unless the store exports or asks us to delete it sooner. Backups roll off within 14 days. Audit logs are kept for as long as the account is active so stores can meet their own record-keeping obligations. Contact-form messages are kept for up to 24 months.</p> },
        { id: "security", title: "Security", body: <p>Data is encrypted in transit (HTTPS) and integration secrets are encrypted at rest. Each store's data is isolated, photos are stored privately and served only to signed-in staff of that store, and every access-sensitive action is audited. See our <Link to="/security">Security</Link> page for details.</p> },
        { id: "rights", title: "Your rights", body: <><p>Depending on where you live — including under India's Digital Personal Data Protection Act, 2023 and the GDPR — you may have the right to access, correct, or delete your personal data, to withdraw consent, and to complain to a data protection authority.</p><p><strong>Shoppers:</strong> your return data belongs to the store you bought from; please contact the store first. We will help the store respond. <strong>Account holders and visitors:</strong> write to {mail(COMPANY.privacyEmail)}. We respond within 30 days.</p></> },
        { id: "changes", title: "Changes to this policy", body: <p>We will post any changes here and update the date above. For material changes we will notify account admins by email before they take effect.</p> },
        { id: "contact", title: "Contact", body: <p>Privacy questions or requests: {mail(COMPANY.privacyEmail)}. Everything else: <Link to="/contact">contact us</Link>.</p> },
      ]}
    />
  );
}

export function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro={`The agreement between ${COMPANY.legalName} and the business that creates a ${COMPANY.product} workspace ("you").`}
      sections={[
        { id: "accept", title: "Accepting these terms", body: <p>By creating a workspace or using {COMPANY.product}, you agree to these terms on behalf of your business, and confirm you are authorised to do so. If you have a separate signed agreement with us, that agreement takes precedence.</p> },
        { id: "service", title: "The service", body: <p>{COMPANY.product} provides a customer return portal, a returns operations console, automation rules, pickup tracking, inspection, refund and inventory tools, analytics, and integrations. We may improve or change features; we will not materially reduce core functionality of a paid plan during its term without notice.</p> },
        { id: "accounts", title: "Accounts and access", body: <ul><li>You are responsible for your team's accounts, for the roles you assign, and for keeping passwords and API keys secure.</li><li>Tell us promptly at {mail(COMPANY.securityEmail)} if you suspect unauthorised access.</li><li>You must be a business; the service is not for personal or consumer use.</li></ul> },
        { id: "data", title: "Your data", body: <><p>You own the data you and your customers put into {COMPANY.product}. You grant us the rights needed to host and process it to provide the service, as described in our <Link to="/privacy">Privacy Policy</Link>.</p><p>You are responsible for having a lawful basis to share your customers' data with us and for your own return policy, refunds and customer communications. You can export your data at any time.</p></> },
        { id: "use", title: "Acceptable use", body: <ul><li>No unlawful, fraudulent or infringing use, and no content you don't have the right to share.</li><li>No attempts to break, probe or overload the service, or to access other workspaces.</li><li>No reselling or white-labelling the service without a written agreement.</li></ul> },
        { id: "integrations", title: "Third-party services", body: <p>Integrations with Shopify, payment gateways, couriers and messaging providers are governed by your agreements with those providers. Refunds are executed by your payment gateway; we are not a payment institution and never hold your funds.</p> },
        { id: "fees", title: "Fees and payment", body: <p>Fees, billing cycles and plan limits are set out in your order or plan. Fees are exclusive of taxes. Cancellations and refunds of subscription fees follow our <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link>.</p> },
        { id: "availability", title: "Availability and support", body: <p>We target 99.5% monthly uptime, excluding scheduled maintenance announced in advance and events outside our reasonable control. Support is available by email at {mail(COMPANY.supportEmail)}.</p> },
        { id: "liability", title: "Warranties and liability", body: <><p>Except as expressly stated, the service is provided "as is". AI suggestions and risk scores are aids to your team's judgement, not decisions — you remain responsible for approvals and refunds.</p><p>To the extent permitted by law, neither party is liable for indirect or consequential losses, and each party's total liability is limited to the fees paid in the 12 months before the claim. Nothing limits liability that cannot be limited by law.</p></> },
        { id: "termination", title: "Ending the agreement", body: <p>You can stop using the service and close your workspace at any time. We may suspend accounts that breach these terms or put the service at risk, with notice where practical. After closure you have 30 days to export your data, after which it is deleted as described in our Privacy Policy.</p> },
        { id: "law", title: "Governing law", body: <p>These terms are governed by the laws of {COMPANY.jurisdiction}. Disputes will first be discussed in good faith; failing that, they will be resolved by the competent courts of {COMPANY.jurisdiction}.</p> },
        { id: "changes", title: "Changes", body: <p>We may update these terms. We will notify workspace admins at least 30 days before material changes take effect; continued use after that date means you accept the updated terms.</p> },
      ]}
    />
  );
}

export function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookie Policy"
      intro={`${COMPANY.product} uses as few cookies as possible — none for advertising or tracking.`}
      sections={[
        { id: "what", title: "What cookies we use", body: <><div className="overflow-x-auto"><table className="w-full text-[14px] border border-line rounded-lg"><thead className="bg-paper text-left"><tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Purpose</th><th className="px-3 py-2 font-medium">Duration</th></tr></thead><tbody><tr className="border-t border-line"><td className="px-3 py-2 font-mono text-[13px]">rf_session</td><td className="px-3 py-2">Keeps staff signed in to the console. HttpOnly, Secure, SameSite=Lax.</td><td className="px-3 py-2">12 hours</td></tr></tbody></table></div><p>The customer return portal does not set cookies; it uses a short-lived token held in the page while a return is being submitted.</p></> },
        { id: "third", title: "Third-party resources", body: <p>Our pages load typefaces from Google Fonts. Google may receive your IP address when the font files are requested, as with any web request. We do not use analytics or advertising trackers.</p> },
        { id: "consent", title: "Consent", body: <p>The session cookie is strictly necessary to provide the service you request, so it does not require consent. If we ever add optional cookies, we will ask first and update this page.</p> },
        { id: "control", title: "Controlling cookies", body: <p>You can block or delete cookies in your browser settings. Blocking the session cookie will prevent you from signing in to the console; the customer portal will still work.</p> },
      ]}
    />
  );
}

export function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Refund & Cancellation Policy"
      intro={`How cancellations and refunds work for ${COMPANY.product} subscriptions. (Refunds to your own customers are governed by your store's return policy.)`}
      sections={[
        { id: "trial", title: "Trials and onboarding", body: <p>Where a free trial is offered, you will not be charged until it ends, and you can cancel any time before then at no cost.</p> },
        { id: "cancel", title: "Cancelling", body: <p>Workspace admins can cancel at any time by writing to {mail(COMPANY.supportEmail)}. Cancellation takes effect at the end of the current billing period and the service remains available until then.</p> },
        { id: "monthly", title: "Monthly plans", body: <p>Monthly fees are not refundable for partial months. If you cancel within 7 days of your first-ever paid month and have processed fewer than 50 returns, we will refund that first month in full.</p> },
        { id: "annual", title: "Annual plans", body: <p>Annual plans cancelled within 14 days of purchase are refunded in full. After that, we refund the unused months on a pro-rata basis, less any discount received for annual billing.</p> },
        { id: "issues", title: "Service problems", body: <p>If we fail to meet our 99.5% monthly uptime target, you can request a service credit of 10% of that month's fee for each full percentage point below target, up to 50%.</p> },
        { id: "how", title: "How refunds are paid", body: <p>Approved refunds are returned to the original payment method within 7–10 business days. Taxes are refunded in line with applicable law.</p> },
        { id: "data", title: "Your data after cancellation", body: <p>You can export returns, refunds and audit data as CSV before and for 30 days after cancellation. After that, data is deleted as described in our <Link to="/privacy">Privacy Policy</Link>.</p> },
      ]}
    />
  );
}
