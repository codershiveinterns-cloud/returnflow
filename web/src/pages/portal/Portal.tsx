import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Camera, Check, CreditCard, Gift, ImagePlus, Minus, PackageCheck, Plus, RefreshCcw, Search, X, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Organization } from "@/lib/domain";
import { date, money } from "@/lib/format";
import { Spinner } from "@/components/ui/Spinner";
import { BrandButton, PortalShell } from "./PortalShell";

type Reason = { code: string; label: string; hint: string; photoRecommended: boolean };
type PortalInfo = { organization: Organization; reasons: Reason[] };
type Item = { id: string; sku: string; name: string; variant: string | null; imageUrl: string | null; quantity: number; unitPriceMinor: number; returnableQuantity: number };
type Order = {
  orderNumber: string; placedAt: string; deliveredAt: string | null; status: string; currency: string; paymentMethod: string; customerName: string | null; returnBy: string; blockedReason: string | null;
  items: Item[]; existingReturns: { rma: string; status: string; createdAt: string }[];
};
type Line = { quantity: number; reason: string; detail: string; photos: File[] };
type Step = "lookup" | "items" | "reasons" | "resolution" | "review" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "items", label: "Items" },
  { id: "reasons", label: "Reason" },
  { id: "resolution", label: "Outcome" },
  { id: "review", label: "Review" },
];
const MAX_PHOTOS = 4;
const MAX_BYTES = 8 * 1024 * 1024;

export function PortalPage() {
  const { slug = "" } = useParams();
  const info = useQuery({ queryKey: ["portal", slug], queryFn: () => api<PortalInfo>(`/portal/${slug}`), retry: false });

  if (info.isLoading) return <div className="min-h-dvh grid place-items-center text-muted"><Spinner className="size-5" /></div>;
  if (!info.data) {
    return (
      <div className="min-h-dvh grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-[20px] font-semibold">This return portal doesn't exist</h1>
          <p className="mt-1 text-muted">Check the link from your order email.</p>
        </div>
      </div>
    );
  }
  return <PortalFlow slug={slug} info={info.data} />;
}

function PortalFlow({ slug, info }: { slug: string; info: PortalInfo }) {
  const org = info.organization;
  const [step, setStep] = useState<Step>("lookup");
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ rma: string; valueMinor: number; currency: string; resolution: string } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `Returns · ${org.name}`;
  }, [org.name]);
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const selected = order ? order.items.filter((i) => lines[i.id]) : [];
  const refundValue = selected.reduce((s, i) => s + i.unitPriceMinor * lines[i.id].quantity, 0);
  const reasonOf = (code: string) => info.reasons.find((r) => r.code === code);

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({
        items: selected.map((i) => ({ orderItemId: i.id, quantity: lines[i.id].quantity, reason: lines[i.id].reason, reasonDetail: lines[i.id].detail.trim() || undefined })),
        resolution,
        note: note.trim() || undefined,
      }));
      selected.forEach((i) => lines[i.id].photos.forEach((p) => fd.append(`photos_${i.id}`, p, p.name)));
      return api<{ rma: string; valueMinor: number; currency: string; resolution: string }>(`/portal/${slug}/returns`, { method: "POST", body: fd, headers: { "x-portal-token": token } });
    },
    onSuccess: (r) => {
      setResult(r);
      setStep("done");
    },
  });

  const reset = () => {
    setStep("lookup");
    setOrder(null);
    setLines({});
    setResolution("");
    setNote("");
    setResult(null);
    submit.reset();
  };

  const hero =
    step === "lookup" ? (
      <>
        <h1 className="font-display text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.01em]">{org.portalHeadline || "Start a return"}</h1>
        <p className="mt-2 text-[15px] opacity-80">Returns are accepted within {org.returnWindowDays} days of delivery. It takes about two minutes.</p>
      </>
    ) : step === "done" ? (
      <h1 className="font-display text-[30px] leading-tight">Request received</h1>
    ) : (
      <>
        <p className="text-[13px] opacity-75">Order #{order?.orderNumber}</p>
        <h1 className="font-display text-[28px] leading-tight">{{ items: "What would you like to return?", reasons: "What went wrong?", resolution: "How can we make it right?", review: "Check and submit" }[step as string]}</h1>
      </>
    );

  return (
    <PortalShell org={org} hero={hero}>
      <div ref={topRef} className="scroll-mt-4" />
      {step !== "lookup" && step !== "done" && <Stepper step={step} onBack={() => setStep(({ items: "lookup", reasons: "items", resolution: "reasons", review: "resolution" } as Record<string, Step>)[step])} />}

      <div className="bg-surface rounded-2xl border border-line shadow-[0_1px_0_rgb(21_23_26/0.03),0_12px_32px_-16px_rgb(21_23_26/0.18)] animate-rise" key={step}>
        {step === "lookup" && (
          <Lookup
            slug={slug}
            onFound={(t, o) => {
              setToken(t);
              setOrder(o);
              setLines({});
              setStep("items");
            }}
          />
        )}

        {step === "items" && order && (
          <div>
            {order.blockedReason ? (
              <div className="p-6">
                <Notice>{order.blockedReason}</Notice>
                <button onClick={reset} className="mt-4 text-[14px] font-medium underline underline-offset-4">Look up a different order</button>
              </div>
            ) : (
              <>
                <div className="px-5 sm:px-6 pt-5 pb-3 text-[13.5px] text-muted flex flex-wrap gap-x-4 gap-y-1">
                  <span>Placed {date(order.placedAt)}</span>
                  {order.deliveredAt && <span>Delivered {date(order.deliveredAt)}</span>}
                  <span className="text-ink font-medium">Return by {date(order.returnBy)}</span>
                </div>
                {order.existingReturns.length > 0 && (
                  <div className="mx-5 sm:mx-6 mb-3 rounded-lg bg-paper px-3.5 py-2.5 text-[13px] text-ink-2">
                    You already have {order.existingReturns.length === 1 ? "a return" : `${order.existingReturns.length} returns`} on this order:{" "}
                    {order.existingReturns.map((r, i) => (
                      <span key={r.rma}>
                        {i > 0 && ", "}
                        <Link to={`/r/${slug}/track?rma=${r.rma}`} className="font-mono font-medium underline underline-offset-2">{r.rma}</Link>
                      </span>
                    ))}
                  </div>
                )}
                <ul className="px-3 sm:px-4 pb-3 space-y-2">
                  {order.items.map((item) => {
                    const on = !!lines[item.id];
                    const disabled = item.returnableQuantity === 0;
                    return (
                      <li key={item.id}>
                        <div
                          role="checkbox"
                          aria-checked={on}
                          aria-disabled={disabled}
                          tabIndex={disabled ? -1 : 0}
                          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !disabled && e.preventDefault()}
                          onClick={() => {
                            if (disabled) return;
                            setLines((l) => {
                              const n = { ...l };
                              if (n[item.id]) delete n[item.id];
                              else n[item.id] = { quantity: 1, reason: "", detail: "", photos: [] };
                              return n;
                            });
                          }}
                          className={clsx(
                            "flex items-center gap-3.5 rounded-xl border-2 p-3.5 transition-colors select-none",
                            disabled ? "border-transparent bg-paper/60 opacity-60 cursor-not-allowed" : on ? "cursor-pointer" : "border-line hover:border-line-strong cursor-pointer",
                          )}
                          style={on ? { borderColor: "var(--brand)", background: "color-mix(in srgb, var(--brand) 5%, white)" } : undefined}
                        >
                          <span className={clsx("grid place-items-center size-6 rounded-md border-2 shrink-0 transition-colors", !on && "border-line-strong")} style={on ? { background: "var(--brand)", borderColor: "var(--brand)", color: "var(--brand-fg)" } : undefined}>
                            {on && <Check className="size-4" strokeWidth={3} />}
                          </span>
                          <ItemThumb item={item} />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[15px] truncate">{item.name}</div>
                            <div className="text-[13px] text-muted">{[item.variant, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}</div>
                            {disabled && <div className="text-[12.5px] text-muted mt-0.5">Already in a return</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-[14px] font-medium tabular">{money(item.unitPriceMinor, order.currency)}</div>
                            {on && item.returnableQuantity > 1 && (
                              <QtyStepper value={lines[item.id].quantity} max={item.returnableQuantity} onChange={(q) => setLines((l) => ({ ...l, [item.id]: { ...l[item.id], quantity: q } }))} />
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Footer>
                  <span className="text-[13.5px] text-muted">{selected.length ? `${selected.reduce((s, i) => s + lines[i.id].quantity, 0)} item${selected.length > 1 || lines[selected[0].id].quantity > 1 ? "s" : ""} selected` : "Select at least one item"}</span>
                  <BrandButton disabled={!selected.length} onClick={() => setStep("reasons")}>Continue</BrandButton>
                </Footer>
              </>
            )}
          </div>
        )}

        {step === "reasons" && order && (
          <div>
            <div className="divide-y divide-line">
              {selected.map((item) => (
                <ReasonBlock
                  key={item.id}
                  item={item}
                  currency={order.currency}
                  reasons={info.reasons}
                  line={lines[item.id]}
                  onChange={(patch) => setLines((l) => ({ ...l, [item.id]: { ...l[item.id], ...patch } }))}
                />
              ))}
            </div>
            <Footer>
              <span className="text-[13.5px] text-muted">Photos help us resolve things faster</span>
              <BrandButton disabled={selected.some((i) => !lines[i.id].reason || (lines[i.id].reason === "other" && !lines[i.id].detail.trim()))} onClick={() => setStep("resolution")}>
                Continue
              </BrandButton>
            </Footer>
          </div>
        )}

        {step === "resolution" && order && (
          <div>
            <div className="p-4 sm:p-5 space-y-2.5">
              {[
                { id: "refund", icon: CreditCard, title: "Refund", body: order.paymentMethod === "cod" ? "To your bank account or UPI — we'll confirm the details with you." : "Back to your original payment method.", tag: money(refundValue, order.currency) },
                { id: "store_credit", icon: Gift, title: "Store credit", body: "Credit you can use on your next order. Usually the fastest option.", tag: money(refundValue, order.currency) },
                { id: "replacement", icon: RefreshCcw, title: "Replacement", body: "Same item sent again — pick a different size in your note if needed.", tag: null },
              ].map((o) => {
                const on = resolution === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setResolution(o.id)}
                    className={clsx("w-full text-left flex items-start gap-3.5 rounded-xl border-2 p-4 transition-colors", !on && "border-line hover:border-line-strong")}
                    style={on ? { borderColor: "var(--brand)", background: "color-mix(in srgb, var(--brand) 5%, white)" } : undefined}
                  >
                    <span className="grid place-items-center size-10 rounded-lg shrink-0" style={on ? { background: "var(--brand)", color: "var(--brand-fg)" } : { background: "var(--color-paper-2)" }}>
                      <o.icon className="size-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold">{o.title}</span>
                        {o.tag && <span className="text-[14px] tabular font-medium">{o.tag}</span>}
                      </span>
                      <span className="block text-[13.5px] text-muted mt-0.5">{o.body}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-5 sm:px-6 pb-5">
              <label className="text-[13.5px] font-medium text-ink-2" htmlFor="note">Anything else we should know? <span className="text-faint font-normal">Optional</span></label>
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="E.g. preferred pickup time, or the size you'd like instead" className="mt-1.5 w-full min-h-[84px] rounded-xl border border-line-strong px-3.5 py-3 text-[14.5px] outline-none focus:border-ink resize-y" />
            </div>
            <Footer>
              <span />
              <BrandButton disabled={!resolution} onClick={() => setStep("review")}>Review request</BrandButton>
            </Footer>
          </div>
        )}

        {step === "review" && order && (
          <div>
            <div className="p-5 sm:p-6 space-y-4">
              {selected.map((item) => {
                const l = lines[item.id];
                return (
                  <div key={item.id} className="flex gap-3.5">
                    <ItemThumb item={item} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-3">
                        <span className="font-medium text-[15px]">{item.name}</span>
                        <span className="tabular text-[14px]">{money(item.unitPriceMinor * l.quantity, order.currency)}</span>
                      </div>
                      <div className="text-[13px] text-muted">{[item.variant, `Returning ${l.quantity}`].filter(Boolean).join(" · ")}</div>
                      <div className="mt-1.5 text-[13.5px]">
                        {reasonOf(l.reason)?.label}
                        {l.detail && <span className="text-muted"> — “{l.detail}”</span>}
                      </div>
                      {l.photos.length > 0 && <div className="mt-1 text-[12.5px] text-muted inline-flex items-center gap-1"><Camera className="size-3.5" /> {l.photos.length} photo{l.photos.length > 1 ? "s" : ""}</div>}
                    </div>
                  </div>
                );
              })}
              <div className="rounded-xl bg-paper p-4 space-y-1.5 text-[14px]">
                <div className="flex justify-between"><span className="text-muted">You'll get</span><span className="font-medium">{{ refund: "Refund", store_credit: "Store credit", replacement: "Replacement" }[resolution]}</span></div>
                {resolution !== "replacement" && <div className="flex justify-between"><span className="text-muted">Estimated value</span><span className="font-semibold tabular">{money(refundValue, order.currency)}</span></div>}
                {note && <div className="pt-1.5 text-muted text-[13px]">Note: {note}</div>}
              </div>
              <p className="text-[12.5px] text-muted">We'll review your request and email you the next steps, including pickup details. Final amounts are confirmed after the items are checked at our warehouse.</p>
              {submit.error && <Notice>{submit.error instanceof ApiError ? submit.error.message : "Something went wrong. Please try again."}</Notice>}
            </div>
            <Footer>
              <span />
              <BrandButton disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? <><Spinner className="size-4" /> Submitting…</> : "Submit return request"}</BrandButton>
            </Footer>
          </div>
        )}

        {step === "done" && result && (
          <div className="p-6 sm:p-8 text-center">
            <div className="mx-auto grid place-items-center size-14 rounded-full" style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
              <PackageCheck className="size-7" />
            </div>
            <p className="mt-5 text-[14px] text-muted">Your return number</p>
            <p className="font-mono text-[28px] font-semibold tracking-tight">{result.rma}</p>
            <p className="mt-3 text-[14.5px] text-ink-2 max-w-sm mx-auto">
              Thanks{order?.customerName ? `, ${order.customerName.split(" ")[0]}` : ""}. We've received your request and will email you once it's reviewed — usually within one business day.
            </p>
            <ol className="mt-6 text-left max-w-sm mx-auto space-y-3">
              {["We review your request", "A courier picks up the parcel", "We inspect the items", result.resolution === "replacement" ? "Your replacement ships" : result.resolution === "store_credit" ? "Store credit is added" : "Your refund is issued"].map((t, i) => (
                <li key={t} className="flex items-center gap-3 text-[14px]">
                  <span className={clsx("grid place-items-center size-6 rounded-full text-[12px] font-semibold shrink-0", i === 0 ? "" : "bg-paper-2 text-muted")} style={i === 0 ? { background: "var(--brand)", color: "var(--brand-fg)" } : undefined}>{i + 1}</span>
                  <span className={i === 0 ? "font-medium" : "text-muted"}>{t}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-col sm:flex-row gap-2 justify-center">
              <Link to={`/r/${slug}/track?rma=${result.rma}`}><BrandButton className="w-full">Track this return</BrandButton></Link>
              <button onClick={reset} className="h-12 px-5 rounded-xl border border-line-strong text-[15px] font-medium hover:bg-paper">Return something else</button>
            </div>
          </div>
        )}
      </div>

      {step === "lookup" && (
        <p className="mt-5 text-center text-[14px] text-muted">
          Already sent something back?{" "}
          <Link to={`/r/${slug}/track`} className="font-medium text-ink underline underline-offset-4 decoration-line-strong">Track a return</Link>
        </p>
      )}
    </PortalShell>
  );
}

function Lookup({ slug, onFound }: { slug: string; onFound: (token: string, order: Order) => void }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const find = useMutation({
    mutationFn: () => api<{ token: string; order: Order }>(`/portal/${slug}/lookup`, { method: "POST", body: { orderNumber, contact } }),
    onSuccess: (r) => onFound(r.token, r.order),
  });
  const err = find.error instanceof ApiError ? find.error : null;
  return (
    <form
      className="p-5 sm:p-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        find.mutate();
      }}
      noValidate
    >
      <PortalInput label="Order number" placeholder="e.g. 1001" value={orderNumber} onChange={setOrderNumber} error={err?.fieldError("orderNumber")} autoFocus inputMode="text" />
      <PortalInput label="Email or phone number" placeholder="The one you used at checkout" value={contact} onChange={setContact} error={err?.fieldError("contact")} autoComplete="email" />
      {err && !err.fields && <Notice>{err.message}</Notice>}
      <BrandButton type="submit" className="w-full" disabled={find.isPending}>
        {find.isPending ? <Spinner className="size-4" /> : <Search className="size-4" />} Find my order
      </BrandButton>
    </form>
  );
}

function ReasonBlock({ item, currency, reasons, line, onChange }: { item: Item; currency: string; reasons: Reason[]; line: Line; onChange: (p: Partial<Line>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const reason = reasons.find((r) => r.code === line.reason);
  const previews = useMemo(() => line.photos.map((f) => ({ f, url: URL.createObjectURL(f) })), [line.photos]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setPhotoError("");
    const next = [...line.photos];
    for (const f of Array.from(files)) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type)) { setPhotoError(`“${f.name}” isn't a photo we can accept (JPG, PNG, WEBP, HEIC).`); continue; }
      if (f.size > MAX_BYTES) { setPhotoError(`“${f.name}” is larger than 8 MB.`); continue; }
      if (next.length >= MAX_PHOTOS) { setPhotoError(`Up to ${MAX_PHOTOS} photos per item.`); break; }
      next.push(f);
    }
    onChange({ photos: next });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <ItemThumb item={item} />
        <div className="min-w-0">
          <div className="font-medium text-[15px] truncate">{item.name}</div>
          <div className="text-[13px] text-muted">{[item.variant, line.quantity > 1 ? `Returning ${line.quantity}` : null, money(item.unitPriceMinor, currency)].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label={`Reason for ${item.name}`}>
        {reasons.filter((r) => !line.reason || expanded || r.code === line.reason).map((r) => {
          const on = line.reason === r.code;
          return (
            <button
              key={r.code}
              role="radio"
              aria-checked={on}
              onClick={() => {
                onChange({ reason: r.code });
                setExpanded(false);
              }}
              className={clsx("text-left rounded-xl border-2 px-3.5 py-3 transition-colors", !on && "border-line hover:border-line-strong")}
              style={on ? { borderColor: "var(--brand)", background: "color-mix(in srgb, var(--brand) 5%, white)" } : undefined}
            >
              <div className="text-[14.5px] font-medium">{r.label}</div>
              <div className="text-[12.5px] text-muted leading-snug mt-0.5">{r.hint}</div>
            </button>
          );
        })}
        {line.reason && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-left sm:text-center rounded-xl px-3.5 py-3 text-[14px] font-medium text-muted hover:text-ink">
            Change reason
          </button>
        )}
      </div>

      {line.reason && (
        <div className="mt-4 space-y-4 animate-rise">
          <div>
            <label className="text-[13.5px] font-medium text-ink-2" htmlFor={`d-${item.id}`}>
              Tell us more {line.reason === "other" ? <span className="text-danger">*</span> : <span className="text-faint font-normal">Optional</span>}
            </label>
            <textarea id={`d-${item.id}`} value={line.detail} onChange={(e) => onChange({ detail: e.target.value })} maxLength={1000} className="mt-1.5 w-full min-h-[76px] rounded-xl border border-line-strong px-3.5 py-3 text-[14.5px] outline-none focus:border-ink resize-y" placeholder={line.reason === "size_issue" ? "E.g. too tight at the shoulders" : "What did you notice?"} />
          </div>
          <div>
            <div className="text-[13.5px] font-medium text-ink-2">
              Photos {reason?.photoRecommended ? <span className="font-normal" style={{ color: "var(--brand)" }}>· recommended</span> : <span className="text-faint font-normal">Optional</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {previews.map((p, i) => (
                <div key={p.url} className="relative size-[76px] rounded-xl overflow-hidden border border-line bg-paper">
                  <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  <button onClick={() => onChange({ photos: line.photos.filter((_, j) => j !== i) })} className="absolute top-1 right-1 grid place-items-center size-6 rounded-full bg-ink/75 text-white" aria-label="Remove photo">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {line.photos.length < MAX_PHOTOS && (
                <button onClick={() => fileRef.current?.click()} className="size-[76px] rounded-xl border-2 border-dashed border-line-strong grid place-items-center text-muted hover:border-faint hover:text-ink transition-colors">
                  <span className="flex flex-col items-center gap-1 text-[11.5px] font-medium">
                    <ImagePlus className="size-5" /> Add
                  </span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </div>
            {photoError && <p className="mt-1.5 text-[12.5px] text-danger">{photoError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step, onBack }: { step: Step; onBack: () => void }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="mb-3 flex items-center gap-3 bg-surface rounded-2xl border border-line px-3 h-12">
      <button onClick={onBack} className="grid place-items-center size-8 rounded-lg hover:bg-paper-2" aria-label="Back">
        <ArrowLeft className="size-4" />
      </button>
      <div className="flex-1 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1">
            <div className="h-1 rounded-full transition-colors" style={{ background: i <= idx ? "var(--brand)" : "var(--color-line)" }} />
            <div className={clsx("mt-1 text-[11px] hidden sm:block", i === idx ? "text-ink font-medium" : "text-faint")}>{s.label}</div>
          </div>
        ))}
      </div>
      <span className="text-[12px] text-muted tabular pr-1">{idx + 1}/{STEPS.length}</span>
    </div>
  );
}

function QtyStepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="mt-1.5 inline-flex items-center rounded-lg border border-line-strong bg-surface" onClick={(e) => e.stopPropagation()}>
      <button disabled={value <= 1} onClick={() => onChange(value - 1)} className="grid place-items-center size-7 disabled:opacity-30" aria-label="Fewer"><Minus className="size-3.5" /></button>
      <span className="w-6 text-center text-[13px] tabular">{value}</span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)} className="grid place-items-center size-7 disabled:opacity-30" aria-label="More"><Plus className="size-3.5" /></button>
    </div>
  );
}

function ItemThumb({ item }: { item: Pick<Item, "name" | "imageUrl"> }) {
  return (
    <span className="size-12 rounded-lg bg-paper-2 border border-line overflow-hidden grid place-items-center shrink-0 text-[15px] font-semibold text-muted">
      {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : item.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
    </span>
  );
}

function PortalInput({ label, value, onChange, error, ...rest }: { label: string; value: string; onChange: (v: string) => void; error?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="text-[13.5px] font-medium text-ink-2">{label}</span>
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className={clsx("mt-1.5 w-full h-12 rounded-xl border px-4 text-[16px] outline-none transition-colors focus:border-ink", error ? "border-danger" : "border-line-strong")} />
      {error && <span className="mt-1 block text-[12.5px] text-danger">{error}</span>}
    </label>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl bg-danger-bg text-danger px-4 py-3 text-[14px]">
      <AlertCircle className="size-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-line bg-surface/95 backdrop-blur rounded-b-2xl">{children}</div>;
}
