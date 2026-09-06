// transport/trpc/routers/settings — the user + app settings surface (core/Tier-4-Transport.md). UserSettings
// verbs are authed (owner-scoped by `principal.userId`); AppSettings + the raw global-KV verbs are
// admin-gated AT THE ROUTER (the verbs themselves take the bare KV pair). Thin:
// validate → `ctx.services.settings.<verb>` → map errors. Schemas derive from `@orb/contracts/settings` +
// `@orb/kit/json`.

import { appSettingsSchema, USER_SETTINGS_SECTIONS } from "@orb/contracts/settings";
import { createThemeInputSchema, promoteThemeInputSchema, updateThemeInputSchema } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { z } from "zod";
import { adminProcedure, authedProcedure, t } from "../trpc.ts";

/** Upper bound on a pasted background URL (well past any real image URL; bounds the wire before safeFetch). */
const MAX_BACKGROUND_URL_LENGTH = 2048;

export const settingsRouter = t.router({
  getUserSettings: authedProcedure.query(({ ctx }) => ctx.services.settings.getUserSettings({ principal: ctx.auth })),

  updateUserSettingsSection: authedProcedure
    .input(
      z.object({
        section: z.enum(USER_SETTINGS_SECTIONS),
        // Deliberately opaque: `patch` is a DEEP-MERGE intake, not the authoritative shape. It is
        // owner-scoped (`principal.userId` — no cross-tenant surface), merged into ONE named section, then
        // the WHOLE blob is re-validated through the lenient `parseUserSettings` at the write seam
        // (`domain/settings/verbs/update-user-settings-section.ts`), which self-heals any malformed key
        // rather than persisting it. A per-section wire schema here would just duplicate that parser; the
        // real enforcement is the re-validate, not this record. (F6 sweep: classified opaque-with-reason.)
        patch: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.settings.updateUserSettingsSection({
        principal: ctx.auth,
        input: { section: input.section, patch: input.patch },
      }),
    ),

  // The whole-blob repair door (#1771, from #1716) — resets this user's settings to the contract defaults.
  // NO INPUT, deliberately: the verb is scoped to `principal.userId` and there is no id to accept, so
  // "reset another user's settings" is not a request the wire can express (the cross-tenant surface is
  // absent by construction, not by a check). It is the ONE settings write that runs while the #471 guard is
  // refusing everything else, because its content is a contract constant rather than a read of the row.
  resetUserConfig: authedProcedure.mutation(({ ctx }) => ctx.services.settings.resetUserConfig({ principal: ctx.auth })),

  // F-P0-2: materialize a user-pasted external image URL into an owned CAS asset, returning a ready
  // BackgroundLibraryEntry the client appends to appearance.backgroundLibrary via the autosave form. Owner-
  // scoped (`principal.userId`) — the asset is stored under the caller. A pasted URL never persists paintable.
  addExternalBackground: authedProcedure
    .input(z.object({ url: z.string().trim().min(1).max(MAX_BACKGROUND_URL_LENGTH) }))
    .mutation(({ ctx, input }) => ctx.services.settings.addExternalBackground({ principal: ctx.auth, url: input.url })),

  // AppSettings (admin-runtime) — admin-gated at the router; the verb re-checks via the injected guard.
  getAppSettings: adminProcedure.query(({ ctx }) => ctx.services.settings.getAppSettings({ principal: ctx.auth })),

  // The admin surface's honest read: resolved config + raw stored overrides (floor-vs-override + clear).
  getAppSettingsWithOverrides: adminProcedure.query(({ ctx }) => ctx.services.settings.getAppSettingsWithOverrides({ principal: ctx.auth })),

  updateAppSettings: adminProcedure
    .input(z.object({ partial: appSettingsSchema }))
    .mutation(({ ctx, input }) => ctx.services.settings.updateAppSettings({ principal: ctx.auth, partial: input.partial })),

  // Raw global-KV — admin-gated at the router (the verbs take the bare key/value, no principal).
  // @server-only: break-glass admin KV — no client panel exists by design; ops-only escape hatch.
  getGlobalSetting: adminProcedure.input(z.object({ key: z.string().min(1) })).query(({ ctx, input }) => ctx.services.settings.getGlobalSetting(input.key)),

  // @server-only: break-glass admin KV — no client panel exists by design; ops-only escape hatch.
  setGlobalSetting: adminProcedure
    .input(z.object({ key: z.string().min(1), value: jsonValueSchema }))
    .mutation(({ ctx, input }) => ctx.services.settings.setGlobalSetting(input.key, input.value)),

  // Themes library (themes-design.md §4) — owner-scoped by `principal.userId`; reads resolve owned ∪
  // seeds, writes go through `fetchOwned` (seeds are un-mutable by construction).
  listThemes: authedProcedure.query(({ ctx }) => ctx.services.settings.listThemes({ principal: ctx.auth })),

  getTheme: authedProcedure
    .input(z.object({ id: brandedId<ThemeId>() }))
    .query(({ ctx, input }) => ctx.services.settings.getTheme({ principal: ctx.auth, id: input.id })),

  createTheme: authedProcedure.input(createThemeInputSchema).mutation(({ ctx, input }) => ctx.services.settings.createTheme({ principal: ctx.auth, input })),

  // TD door 1 — promote a character card's look into the library. Owner-scoped (`principal.userId`); the
  // input is VALUES only (no foreign id to reach through), so there is no cross-tenant surface here.
  promoteTheme: authedProcedure.input(promoteThemeInputSchema).mutation(({ ctx, input }) => ctx.services.settings.promoteTheme({ principal: ctx.auth, input })),

  duplicateTheme: authedProcedure.input(z.object({ id: brandedId<ThemeId>(), name: z.string().trim().min(1).optional() })).mutation(({ ctx, input }) =>
    ctx.services.settings.duplicateTheme({
      principal: ctx.auth,
      id: input.id,
      ...(input.name === undefined ? {} : { name: input.name }),
    }),
  ),

  updateTheme: authedProcedure
    .input(z.object({ id: brandedId<ThemeId>(), input: updateThemeInputSchema }))
    .mutation(({ ctx, input }) => ctx.services.settings.updateTheme({ principal: ctx.auth, id: input.id, input: input.input })),

  removeTheme: authedProcedure
    .input(z.object({ id: brandedId<ThemeId>() }))
    .mutation(({ ctx, input }) => ctx.services.settings.removeTheme({ principal: ctx.auth, id: input.id })),
});
