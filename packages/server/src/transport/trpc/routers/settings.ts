// transport/trpc/routers/settings — the user + app settings surface (core/Tier-4-Transport.md). UserSettings
// verbs are authed (owner-scoped by `principal.userId`); AppSettings + the raw global-KV verbs are
// admin-gated AT THE ROUTER (the verbs themselves take the bare KV pair). Thin:
// validate → `ctx.services.settings.<verb>` → map errors. Schemas derive from `@orb/contracts/settings` +
// `@orb/kit/json`.

import {
  appSettingsSchema,
  USER_SETTINGS_SECTIONS,
  userSettingsSchema,
} from "@orb/contracts/settings";
import { createThemeInputSchema, updateThemeInputSchema } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
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

  // Themes library (themes-design.md §4) — owner-scoped by `principal.userId`; reads resolve owned ∪
  // seeds, writes go through `fetchOwned` (seeds are un-mutable by construction).
  listThemes: authedProcedure.query(({ ctx }) =>
    ctx.services.settings.listThemes({ principal: ctx.auth }),
  ),

  getTheme: authedProcedure
    .input(z.object({ id: brandedId<ThemeId>() }))
    .query(({ ctx, input }) =>
      ctx.services.settings.getTheme({ principal: ctx.auth, id: input.id }),
    ),

  createTheme: authedProcedure
    .input(createThemeInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.services.settings.createTheme({ principal: ctx.auth, input }),
    ),

  duplicateTheme: authedProcedure
    .input(z.object({ id: brandedId<ThemeId>(), name: z.string().trim().min(1).optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.settings.duplicateTheme({
        principal: ctx.auth,
        id: input.id,
        ...(input.name === undefined ? {} : { name: input.name }),
      }),
    ),

  updateTheme: authedProcedure
    .input(z.object({ id: brandedId<ThemeId>(), input: updateThemeInputSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.settings.updateTheme({ principal: ctx.auth, id: input.id, input: input.input }),
    ),

  removeTheme: authedProcedure
    .input(z.object({ id: brandedId<ThemeId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.settings.removeTheme({ principal: ctx.auth, id: input.id }),
    ),
});
