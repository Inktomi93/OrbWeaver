// transport/trpc/routers/plugin — the D46 plugin management surface (core/Tier-4-Transport.md). authed; every
// verb passes the resolved `Principal` as `caller` (the domain enforces install authority = owner∪admin via
// its injected `can()` — 02 §4 — so no `adminProcedure` here; the service is the authoritative gate). The
// bundle bytes ride as base64 in the mutation input (a zip is ≤ 1 MiB — `substrate/manifest.ts` re-caps + is
// the untrusted-input boundary); a multipart upload route can supersede this later without a domain change
// (the bundle funnel is source-agnostic — 02 §4 rider). `runSnippet` is the inline mode (03 §1): the service
// gates the caller's chat authority leak-free (foreign chat ⇒ NOT_FOUND). Event delivery / tool invocation are
// P4b.

import { PLUGIN_CAPABILITIES } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

const pluginIdSchema = typeIdSchema(ID_PREFIX.plugin);
// Lax like the chat router's chatId (leak-free gating is the service's `resolveChatAuthority`, not a strict
// TypeID parse that would distinguish malformed-vs-not-found).
const chatIdSchema = brandedId<ChatId>();
const grantSchema = z.array(z.enum(PLUGIN_CAPABILITIES));
/** Inline-snippet source cap — a REPL line typed in the box, not a shipped bundle (which rides install). */
const SNIPPET_CODE_MAX = 65_536;

/** Decode the base64 bundle payload into the `Uint8Array` the install/upgrade verbs consume. */
function decodeBundle(bundleBase64: string): Uint8Array {
  return new Uint8Array(Buffer.from(bundleBase64, "base64"));
}

export const pluginRouter = t.router({
  install: authedProcedure
    .input(z.object({ bundleBase64: z.string(), grant: grantSchema }))
    .mutation(({ ctx, input }) => ctx.services.plugin.install({ caller: ctx.auth, bundle: decodeBundle(input.bundleBase64), grant: input.grant })),

  upgrade: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, bundleBase64: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.plugin.upgrade({ caller: ctx.auth, pluginId: input.pluginId, bundle: decodeBundle(input.bundleBase64) })),

  setEnabled: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.plugin.setEnabled({ caller: ctx.auth, pluginId: input.pluginId, enabled: input.enabled })),

  uninstall: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema }))
    .mutation(({ ctx, input }) => ctx.services.plugin.uninstall({ caller: ctx.auth, pluginId: input.pluginId })),

  list: authedProcedure.query(({ ctx }) => ctx.services.plugin.list({ caller: ctx.auth })),

  getLog: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, limit: z.number().int().positive().optional() }))
    .query(({ ctx, input }) =>
      ctx.services.plugin.getLog({ caller: ctx.auth, pluginId: input.pluginId, ...(input.limit !== undefined ? { limit: input.limit } : {}) }),
    ),

  // The inline mode (03 §1): run `code` once as the caller in `chatId`. The service gates chat authority
  // leak-free (a chat the caller can't read ⇒ NOT_FOUND) and returns the drained log + a contained `error`.
  runSnippet: authedProcedure
    .input(z.object({ chatId: chatIdSchema, code: z.string().max(SNIPPET_CODE_MAX) }))
    .mutation(({ ctx, input }) => ctx.services.plugin.runSnippet({ caller: ctx.auth, chatId: input.chatId, code: input.code })),
});
