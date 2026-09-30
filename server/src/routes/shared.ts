import type { Organization } from "../generated/prisma/client.js";
import { z } from "zod";

export const orgPublic = (org: Organization) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  currency: org.currency,
  brandColor: org.brandColor,
  logoUrl: org.logoKey ? `/api/public/orgs/${org.slug}/logo?v=${org.updatedAt.getTime()}` : null,
  supportEmail: org.supportEmail,
  portalHeadline: org.portalHeadline,
  returnWindowDays: org.returnWindowDays,
});

export const rma = (n: number) => `RF-${n}`;

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

export const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
