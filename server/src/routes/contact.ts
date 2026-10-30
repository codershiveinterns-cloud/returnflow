import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "../db.js";
import { rateLimit } from "../lib/rateLimit.js";

/** Public website contact form. Stored, and emailed to CONTACT_INBOX when SMTP is configured. */
export const contactRouter = Router();

const body = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  company: z.string().trim().max(120).optional(),
  topic: z.enum(["sales", "support", "partnership", "privacy", "other"]),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(4000),
  website: z.string().max(0).optional(), // honeypot — real people leave it empty
});

contactRouter.post("/", rateLimit({ windowMs: 10 * 60_000, max: 5 }), async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) throw parsed.error;
  const { website: _hp, ...data } = parsed.data;
  const saved = await db.contactMessage.create({ data: { ...data, company: data.company || null, ip: req.ip } });
  if (process.env.SMTP_URL && process.env.CONTACT_INBOX) {
    nodemailer
      .createTransport(process.env.SMTP_URL)
      .sendMail({
        from: process.env.MAIL_FROM,
        to: process.env.CONTACT_INBOX,
        replyTo: data.email,
        subject: `[ReturnFlow ${data.topic}] ${data.name}${data.company ? ` · ${data.company}` : ""}`,
        text: `${data.message}\n\n— ${data.name} <${data.email}>`,
      })
      .catch((e) => console.error("contact email failed", e));
  }
  res.status(201).json({ id: saved.id });
});
