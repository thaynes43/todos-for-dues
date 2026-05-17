import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { chapterSettings } from '@app/db/schema';
import { router } from '../trpc';
import { adminProcedure } from '../middleware/role';
import {
  SETTING_VALIDATORS,
  SETTING_KEYS,
  type SettingKey,
} from '../settings-shared';

export { SETTING_VALIDATORS, SETTING_KEYS };
export type { SettingKey };

export const settingsRouter = router({
  // PRD-007 R-07 — Admin lists all chapter settings.
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(chapterSettings);
  }),

  // PRD-007 R-07/R-08 — Admin sets a chapter setting with per-key validation.
  set: adminProcedure
    .input(
      z.object({
        key: z.enum(SETTING_KEYS as [keyof typeof SETTING_VALIDATORS, ...Array<keyof typeof SETTING_VALIDATORS>]),
        value: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const validator = SETTING_VALIDATORS[input.key];
      const parsed = validator.safeParse(input.value);
      if (!parsed.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid value for ${input.key}: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        });
      }
      await ctx.db
        .insert(chapterSettings)
        .values({
          key: input.key,
          value: parsed.data,
          updatedBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: chapterSettings.key,
          set: {
            value: parsed.data,
            updatedBy: ctx.userId,
            updatedAt: sql`now()`,
          },
        });
    }),
});
