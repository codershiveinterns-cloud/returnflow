import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { filePath } from "../lib/storage.js";

/**
 * AI-assisted analysis.
 *
 * Uses Claude when Anthropic credentials are configured (ANTHROPIC_API_KEY or
 * ANTHROPIC_AUTH_TOKEN). Otherwise a deterministic rules-based analyser runs,
 * so the workflow behaves the same without a key — suggestions are just less
 * nuanced. Staff always make the final call; nothing here changes a return's
 * status on its own.
 */
export const MODEL = "claude-opus-5-5";
const REASONS = ["size_issue", "defective", "wrong_item", "not_as_described", "changed_mind", "other"] as const;

let client: Anthropic | null | undefined;
function claude() {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;
  return client;
}
export const aiProvider = () => (claude() ? "claude" : "rules");

async function ask<T extends z.ZodType>(schema: T, system: string, content: Anthropic.Beta.Messages.BetaContentBlockParam[], maxTokens = 2048): Promise<z.infer<T> | null> {
  const c = claude();
  if (!c) return null;
  try {
    const res = await c.beta.messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return res.parsed_output as z.infer<T>;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("AI rate limited; using rules-based analysis");
    else if (err instanceof Anthropic.APIError) console.warn(`AI request failed (${err.status}); using rules-based analysis`);
    else console.warn("AI request failed; using rules-based analysis", err);
    return null;
  }
}

// ───────────────────────── Reason classification ─────────────────────────

const ReasonSchema = z.object({
  reason: z.enum(REASONS),
  confidence: z.number().min(0).max(1),
  summary: z.string().describe("One short sentence describing the customer's actual problem, max 15 words"),
});
export type ReasonAnalysis = z.infer<typeof ReasonSchema> & { source: "claude" | "rules" };

const KEYWORDS: [typeof REASONS[number], RegExp][] = [
  ["wrong_item", /\b(wrong|different (item|product|colou?r|size)|instead of|not what i ordered|sent (me )?(a|the) (blue|red|black|white)|mix-?up)\b/i],
  ["defective", /\b(broken|torn|tear|ripped|stain|defect|damag|peel|crack|loose|stitch|seam|hole|faulty|not working|stopped working|scratch|glue)\b/i],
  ["size_issue", /\b(size|fit|tight|loose fit|small|large|big|short|long|narrow|wide|waist|shoulder|runs (small|large))\b/i],
  ["not_as_described", /\b(colou?r|shade|darker|lighter|smaller than|bigger than|looks different|not as (shown|described|pictured)|photos?|material|quality|fabric|thin)\b/i],
  ["changed_mind", /\b(changed my mind|don'?t need|no longer|gift|duplicate|ordered (by )?mistake|already (have|had)|don'?t like)\b/i],
];

function classifyByRules(text: string, claimed: string): ReasonAnalysis {
  for (const [reason, re] of KEYWORDS) {
    if (re.test(text)) return { reason, confidence: 0.6, summary: text.trim().slice(0, 90), source: "rules" };
  }
  return { reason: claimed as typeof REASONS[number], confidence: 0.4, summary: text.trim().slice(0, 90), source: "rules" };
}

export async function classifyReason(text: string, claimed: string, product: string): Promise<ReasonAnalysis> {
  const ai = await ask(
    ReasonSchema,
    "You classify e-commerce return reasons for analytics. Pick the single best category for what actually happened, even if the customer chose a different one. Categories: size_issue (fit/size), defective (damaged, broken, faulty, poor workmanship), wrong_item (received a different product/size/colour than ordered), not_as_described (differs from the listing: colour, material, dimensions), changed_mind (no longer wanted, gift, duplicate), other.",
    [{ type: "text", text: `Product: ${product}\nCustomer-selected reason: ${claimed}\nCustomer's words: """${text}"""` }],
    1024,
  );
  return ai ? { ...ai, source: "claude" } : classifyByRules(text, claimed);
}

// ───────────────────────── Condition analysis ─────────────────────────

export type Checklist = { packaging: "pass" | "fail"; tags: "pass" | "fail"; damage: "pass" | "fail"; usage: "pass" | "fail" };

const ConditionSchema = z.object({
  grade: z.enum(["A", "B", "C", "D"]),
  disposition: z.enum(["restock", "refurbish", "damaged", "dispose"]),
  mismatch: z.boolean().describe("True if the item's condition contradicts the customer's claimed reason"),
  explanation: z.string().describe("Two short sentences for the inspector, citing what the photos show"),
});
export type ConditionAnalysis = z.infer<typeof ConditionSchema> & { source: "claude" | "rules" };

function conditionByRules(checklist: Checklist, claimed: string): ConditionAnalysis {
  const fails = Object.entries(checklist).filter(([, v]) => v === "fail").map(([k]) => k);
  let grade: ConditionAnalysis["grade"] = "A";
  if (fails.includes("damage")) grade = fails.length >= 3 ? "D" : "C";
  else if (fails.includes("usage")) grade = "C";
  else if (fails.length) grade = "B";
  const disposition = grade === "A" ? "restock" : grade === "B" ? "refurbish" : grade === "C" ? "damaged" : "dispose";
  const claimsDamage = claimed === "defective";
  const mismatch = (claimsDamage && !fails.includes("damage")) || (!claimsDamage && fails.includes("damage") && fails.includes("usage"));
  const explanation = fails.length
    ? `Checklist issues: ${fails.join(", ")}. ${mismatch ? (claimsDamage ? "Customer reported damage, but none was found." : "Damage and signs of use were found on an item returned for another reason.") : "Condition is consistent with the customer's reason."}`
    : `All checks passed — item looks resaleable. ${mismatch ? "Customer reported damage, but none was found." : ""}`.trim();
  return { grade, disposition, mismatch, explanation, source: "rules" };
}

export async function analyzeCondition(input: {
  product: string;
  claimedReason: string;
  customerDetail?: string | null;
  checklist: Checklist;
  photos: { storageKey: string; mimeType: string; uploadedBy: string }[];
}): Promise<ConditionAnalysis> {
  const images: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  for (const p of input.photos.slice(0, 6)) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(p.mimeType)) continue;
    try {
      const data = fs.readFileSync(filePath(p.storageKey)).toString("base64");
      images.push({ type: "text", text: p.uploadedBy === "customer" ? "Customer photo:" : "Warehouse inspection photo:" });
      images.push({ type: "image", source: { type: "base64", media_type: p.mimeType as "image/jpeg", data } });
    } catch {
      /* missing file — skip */
    }
  }
  const ai = await ask(
    ConditionSchema,
    "You help warehouse staff grade returned retail items. Grades: A = resaleable as new, B = minor issues (missing tag, packaging), refurbish, C = visible damage or wear, D = unusable. Dispositions: restock (A), refurbish (B), damaged (C), dispose (D). Flag a mismatch when the evidence contradicts the customer's claimed reason (e.g. claimed defective but no defect visible, or claimed wrong size but item shows heavy use). Be conservative; staff make the final decision.",
    [
      ...images,
      {
        type: "text",
        text: `Product: ${input.product}\nCustomer's reason: ${input.claimedReason}${input.customerDetail ? ` — "${input.customerDetail}"` : ""}\nInspector checklist: ${JSON.stringify(input.checklist)}\n${images.length ? "" : "No photos available — rely on the checklist."}`,
      },
    ],
  );
  return ai ? { ...ai, source: "claude" } : conditionByRules(input.checklist, input.claimedReason);
}
