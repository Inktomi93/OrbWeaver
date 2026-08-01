// transport/trpc/routers/preset — the generation-config surface (core/Tier-4-Transport.md). authed; the verbs
// take a scalar `userId` (preset is single-owner — `ownerId === userId`, no resource-role), supplied from
// the resolved `Principal.userId` (never client input). `resolveEffective` is the one exception: it passes
// the whole `Principal`, because its capability half resolves the CALLER's own connection.
//
// `config` rides `promptConfigWriteSchema` — the read schema PLUS the guards that may refuse an author's edit
// (today: a format string that dropped its carrier token). Reads keep the plain schema on purpose, so a
// preset that already carries a broken wrapper still loads and can be fixed in the editor.

import { promptConfigWriteSchema } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

/** Upload bound for one `orb.preset` file. A preset blob is sections + knobs + templates — generous next to
 *  the schema's own per-field caps (100k-char section bodies × 500 sections is the real ceiling), and a bound
 *  the untrusted-input boundary needs so a hostile paste can't stream unbounded text at the parser. */
const MAX_PRESET_FILE_CHARS = 8_000_000;

export const presetRouter = t.router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        kind: z.string().min(1),
        config: promptConfigWriteSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.preset.create({
        userId: ctx.auth.userId,
        name: input.name,
        kind: input.kind,
        ...(input.config !== undefined ? { config: input.config } : {}),
      }),
    ),

  list: authedProcedure.query(({ ctx }) => ctx.services.preset.list({ userId: ctx.auth.userId })),

  get: authedProcedure
    .input(z.object({ id: brandedId<PresetId>() }))
    .query(({ ctx, input }) => ctx.services.preset.get({ userId: ctx.auth.userId, id: input.id })),

  update: authedProcedure
    .input(
      z.object({
        id: brandedId<PresetId>(),
        name: z.string().min(1).optional(),
        kind: z.string().min(1).optional(),
        config: promptConfigWriteSchema.optional(),
        // The copy-on-write fork intent (only meaningful when `id` is the system default) — absent means
        // `converge`, the historical silent behavior. `name` is required and non-empty on the "new" arm so a
        // nameless mint is unrepresentable; the verb de-collides it (`uniquePresetName`).
        fork: z
          .discriminatedUnion("mode", [z.object({ mode: z.literal("converge") }), z.object({ mode: z.literal("new"), name: z.string().min(1) })])
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.preset.update({
        userId: ctx.auth.userId,
        id: input.id,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.config !== undefined ? { config: input.config } : {}),
        ...(input.fork !== undefined ? { fork: input.fork } : {}),
      }),
    ),

  remove: authedProcedure
    .input(z.object({ id: brandedId<PresetId>() }))
    .mutation(({ ctx, input }) => ctx.services.preset.remove({ userId: ctx.auth.userId, id: input.id })),

  resetToDefault: authedProcedure
    .input(z.object({ id: brandedId<PresetId>() }))
    .mutation(({ ctx, input }) => ctx.services.preset.resetToDefault({ userId: ctx.auth.userId, id: input.id })),

  // The editor's effective-profile read (redesign §4.3): the generation funnel projected for THIS preset
  // against the caller's own chat model. Caller-scoped both ways — the preset must be readable by them, and
  // the capability half takes only the resolved Principal.
  resolveEffective: authedProcedure
    .input(z.object({ id: brandedId<PresetId>() }))
    .query(({ ctx, input }) => ctx.services.preset.resolveEffective({ principal: ctx.auth, id: input.id })),

  // The single-preset import door (G6) — a thin arm over the ONE `ImportPreset` verb the profile bundle uses,
  // so the merge/collision semantics are the bundle's by construction. The file is UTF-8 JSON text.
  importFile: authedProcedure
    .input(z.object({ fileText: z.string().max(MAX_PRESET_FILE_CHARS) }))
    .mutation(({ ctx, input }) => ctx.services.preset.importFile({ userId: ctx.auth.userId, fileText: input.fileText })),
});
