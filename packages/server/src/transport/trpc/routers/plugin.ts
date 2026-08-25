// transport/trpc/routers/plugin — the D46 plugin management surface (core/Tier-4-Transport.md). authed; every
// verb passes the resolved `Principal` as `caller` (the domain is the authoritative gate). `authedProcedure`
// is the RIGHT floor and not a gap: plugins are USER-SCOPED (D147) — anyone installs for themselves and the
// plugin runs under them — so the authority question is "is this row yours", which only the domain can answer
// off the row. An `adminProcedure` here would be the wrong shape twice over: it would lock every user out of
// their own pane, and it would imply an authority the verbs deliberately do not have (there is no admin
// any-row branch; a foreign pluginId is a leak-free NOT_FOUND). The
// bundle bytes ride as base64 in the mutation input (a zip is ≤ 1 MiB — `substrate/manifest.ts` re-caps + is
// the untrusted-input boundary); a multipart upload route can supersede this later without a domain change
// (the bundle funnel is source-agnostic). `runSnippet` is the inline mode: the service
// gates the caller's chat authority leak-free (foreign chat ⇒ NOT_FOUND). Event delivery / tool invocation are
// P4b.
//
// The client wave landed: `packages/client/src/features/plugin` is the install/list/grant pane and it calls
// `trpc.plugin.*` for real. `upgrade`/`setGrant`/`setEnabled`/`uninstall` are PROBED by the cross-tenant sweep
// as a stranger holding another user's real pluginId; `install`/`list` are exempt there because neither takes
// a foreign id (install mints the caller's own row, list takes no input at all).

import { NET_HOSTS_MAX, PLUGIN_CAPABILITIES, PLUGIN_LOG_LIST_MAX_LIMIT, pluginNetHostSchema } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

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

  // RE-CONSENT. `grant` is the WHOLE new confirmed subset (not a delta) and `acknowledgedNetHosts` is the
  // caller's echo of the exact `PluginView.netHosts` it displayed — the anti-TOCTOU pin the service refuses on
  // when `net.fetch` is in the grant. Validated with the manifest's OWN hostname grammar (`pluginNetHostSchema`)
  // rather than a second hand-rolled host rule; NO default, because a silently-defaulted `[]` would make
  // "the client forgot to send the echo" indistinguishable from "the owner saw an empty list".
  setGrant: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, grant: grantSchema, acknowledgedNetHosts: z.array(pluginNetHostSchema).max(NET_HOSTS_MAX) }))
    .mutation(({ ctx, input }) =>
      ctx.services.plugin.setGrant({
        caller: ctx.auth,
        pluginId: input.pluginId,
        grant: input.grant,
        acknowledgedNetHosts: input.acknowledgedNetHosts,
      }),
    ),

  setEnabled: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.plugin.setEnabled({ caller: ctx.auth, pluginId: input.pluginId, enabled: input.enabled })),

  uninstall: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema }))
    .mutation(({ ctx, input }) => ctx.services.plugin.uninstall({ caller: ctx.auth, pluginId: input.pluginId })),

  list: authedProcedure.query(({ ctx }) => ctx.services.plugin.list({ caller: ctx.auth })),

  getLog: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, limit: z.number().int().positive().max(PLUGIN_LOG_LIST_MAX_LIMIT).optional() }))
    .query(({ ctx, input }) =>
      ctx.services.plugin.getLog({ caller: ctx.auth, pluginId: input.pluginId, ...(input.limit !== undefined ? { limit: input.limit } : {}) }),
    ),

  // The inline mode: run `code` once as the caller in `chatId`. The service gates chat authority
  // leak-free (a chat the caller can't read ⇒ NOT_FOUND) and returns the drained log + a contained `error`.
  runSnippet: authedProcedure
    .input(z.object({ chatId: chatIdSchema, code: z.string().max(SNIPPET_CODE_MAX) }))
    .mutation(({ ctx, input }) => ctx.services.plugin.runSnippet({ caller: ctx.auth, chatId: input.chatId, code: input.code })),
});
