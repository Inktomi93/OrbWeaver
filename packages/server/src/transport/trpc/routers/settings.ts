// transport/trpc/routers/settings — the user + app settings surface (tiers/transport.md). UserSettings
// verbs are authed (owner-scoped by `principal.userId`); AppSettings + the raw global-KV verbs are
// admin-gated AT THE ROUTER (settings.md §7.1 — the verbs themselves take the bare KV pair). Thin:
// validate → `ctx.services.settings.<verb>` → map errors. Schemas derive from `@orb/contracts/settings` +
// `@orb/kit/json`.

import {
  appSettingsSchema,
  USER_SETTINGS_SECTIONS,
  userSettingsSchema,
} from "@orb/contracts/settings";
import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";
import { adminProcedure, authedProcedure, t } from "../trpc";

export const settingsRouter = t.router({
  getUserSettings: authedProcedure.query(({ ctx }) =>
    ctx.services.settings.getUserSettings({ principal: ctx.auth }),
  ),

  updateUserSettings: authedProcedure
    .input(z.object({ config: userSettingsSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.settings.updateUserSettings({
        principal: ctx.auth,
        input: { config: input.config },
      }),
    ),

  updateUserSettingsSection: authedProcedure
    .input(
      z.object({
        section: z.enum(USER_SETTINGS_SECTIONS),
        patch: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.settings.updateUserSettingsSection({
        principal: ctx.auth,
        input: { section: input.section, patch: input.patch },
      }),
    ),

  // AppSettings (admin-runtime) — admin-gated at the router; the verb re-checks via the injected guard.
  getAppSettings: adminProcedure.query(({ ctx }) =>
    ctx.services.settings.getAppSettings({ principal: ctx.auth }),
  ),

  updateAppSettings: adminProcedure
    .input(z.object({ partial: appSettingsSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.settings.updateAppSettings({ principal: ctx.auth, partial: input.partial }),
    ),

  // Raw global-KV — admin-gated at the router (the verbs take the bare key/value, no principal).
  getGlobalSetting: adminProcedure
    .input(z.object({ key: z.string().min(1) }))
    .query(({ ctx, input }) => ctx.services.settings.getGlobalSetting(input.key)),

  setGlobalSetting: adminProcedure
    .input(z.object({ key: z.string().min(1), value: jsonValueSchema }))
    .mutation(({ ctx, input }) => ctx.services.settings.setGlobalSetting(input.key, input.value)),
});
