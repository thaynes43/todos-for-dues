import { z } from 'zod';

// PLAN-011: Zod validators for chapter_settings.set, kept in this isolated
// module so the web client can import them without pulling the rest of the
// API surface (including `pg`/`drizzle-orm` via the tRPC context) into the
// browser bundle.

export const SETTING_VALIDATORS = {
  admin_recipient_email: z.string().email(),
  treasurer_recipient_email: z.string().email(),
  moderators_recipient_email: z.string().email(),
  chapter_timezone: z.string().regex(/^[A-Za-z_]+\/[A-Za-z0-9_+-]+$/),
  chapter_display_name: z.string().trim().min(1).max(120),
} as const;

export type SettingKey = keyof typeof SETTING_VALIDATORS;

export const SETTING_KEYS = Object.keys(SETTING_VALIDATORS) as readonly SettingKey[];
