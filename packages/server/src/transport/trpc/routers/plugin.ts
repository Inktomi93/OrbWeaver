// transport/trpc/routers/plugin — the D46 plugin management surface (core/Tier-4-Transport.md). authed; every
// verb passes the resolved `Principal` as `caller` (the domain is the authoritative gate). `authedProcedure`
// is the RIGHT floor and not a gap: plugins are USER-SCOPED (D147) — anyone installs for themselves and the
// plugin runs under them — so the authority question is "is this row yours", which only the domain can answer
// off the row. An `adminProcedure` on THOSE verbs would be the wrong shape twice over: it would lock every
// user out of their own pane, and it would imply an authority they deliberately do not have (there is no
// admin any-row branch; a foreign pluginId is a leak-free NOT_FOUND). The three DISTRIBUTION verbs at the
// bottom are `adminProcedure` and are not a counter-example: they take no foreign id, publish deployment
// policy rather than touching anyone's row, and mint only disabled zero-grant copies (D147 clause (d)). The
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
//
// The UI-surface READ side (plugin-ui-plane #679 U1): `getSurfaceState`/`invokeUiAction` join the PROBED set
// (both take a foreign pluginId; the service gates each on the owner-scoped `getById`); `listSurfaces` is
// exempt like `list` (no input — the caller's own enabled plugins).

import {
  NET_HOSTS_MAX,
  PLUGIN_CAPABILITIES,
  PLUGIN_COMMAND_ARGS_MAX,
  PLUGIN_COMMAND_NAME_RE,
  PLUGIN_DISPLAY_TEXT_MAX_CHARS,
  PLUGIN_LOG_LIST_MAX_LIMIT,
  PLUGIN_SURFACE_ID_RE,
  pluginNetHostSchema,
  pluginSlugSchema,
} from "@orb/contracts/plugin";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { adminProcedure, authedProcedure, t } from "../trpc.ts";

const pluginIdSchema = typeIdSchema(ID_PREFIX.plugin);
// Lax like the chat router's chatId (leak-free gating is the service's `resolveChatAuthority`, not a strict
// TypeID parse that would distinguish malformed-vs-not-found).
const chatIdSchema = brandedId<ChatId>();
// Same laxity, same reason: the display round-trip never READS the row, so a strict TypeID parse would only
// distinguish malformed-from-absent for an id the guest merely sees as its `env`.
const messageIdSchema = brandedId<MessageId>();
const grantSchema = z.array(z.enum(PLUGIN_CAPABILITIES));
/** A surface / action id — the plugin-local ident grammar (`host.ui.register`'s id, §4.2). Defense-in-depth at
 *  the wire edge; the verb still resolves the surface/handler's actual existence off the caller's own instance. */
const surfaceIdSchema = z.string().regex(PLUGIN_SURFACE_ID_RE);
/** The action's collected form-field bag — string→string (numberField/toggle/slider serialize to string). */
const uiActionValuesSchema = z.record(z.string(), z.string());
/** A button's `actionId` — a plugin-local action name (NOT an entity id, so a bounded string, never a branded
 *  id). Named so the wire cap has one home; the verb resolves the action's actual existence off the registered
 *  spec (the ui.ts button ident grammar tops out at 64). */
const ACTION_ID_MAX = 64;
const actionIdSchema = z.string().min(1).max(ACTION_ID_MAX);
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

  // ── SERVER-WIDE DISTRIBUTION (D147 clause (d)) — the only `adminProcedure`s on this router, and the
  //    exception that proves the rule above: the per-row verbs stay `authedProcedure` because their question
  //    is "is this row yours", while these three ask "may this caller publish to the deployment", which is a
  //    global-role question. The gate is DOUBLED on purpose (the `admin.linkSsoIdentity` posture): the ladder
  //    refuses a non-admin here at layer 1, and the domain verb re-checks with its injected `requireAdmin`, so
  //    neither half is load-bearing alone. Publishing MINTS disabled, zero-grant, consent-pending rows and
  //    runs nothing — there is deliberately no force-enable verb, and adding one would reopen D147 clause (b).
  installForAllUsers: adminProcedure
    .input(z.object({ bundleBase64: z.string() }))
    .mutation(({ ctx, input }) => ctx.services.plugin.installForAllUsers({ caller: ctx.auth, bundle: decodeBundle(input.bundleBase64) })),

  // `slug` is the manifest id — a plain string by contract, never a branded id (a slug is the plugin author's
  // own namespace, validated by `pluginManifestSchema` at the trust edge, not minted by us).
  uninstallForAllUsers: adminProcedure
    .input(z.object({ slug: pluginSlugSchema }))
    .mutation(({ ctx, input }) => ctx.services.plugin.uninstallForAllUsers({ caller: ctx.auth, slug: input.slug })),

  listDistributed: adminProcedure.query(({ ctx }) => ctx.services.plugin.listDistributedPlugins({ caller: ctx.auth })),

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

  // ── The Tier-S UI-surface READ side (plugin-ui-plane #679 U1). `listSurfaces` takes no input (the caller's
  //    own enabled plugins' surfaces — sweep-EXEMPT like `list`). `getSurfaceState`/`invokeUiAction` take a
  //    FOREIGN pluginId and are PROBED by the cross-tenant sweep as a stranger holding owner A's real id — the
  //    service gates each on the owner-scoped `getById` load (leak-free NOT_FOUND). `invokeUiAction` is the
  //    guest-action round-trip: the mutation surfaces a throwing handler as a typed refusal (house toast) and a
  //    repeat crash rides the 3-strike auto-disable.
  listSurfaces: authedProcedure.query(({ ctx }) => ctx.services.plugin.listSurfaces({ caller: ctx.auth })),

  getSurfaceState: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, surfaceId: surfaceIdSchema }))
    .query(({ ctx, input }) => ctx.services.plugin.getSurfaceState({ caller: ctx.auth, pluginId: input.pluginId, surfaceId: input.surfaceId })),

  invokeUiAction: authedProcedure
    .input(z.object({ pluginId: pluginIdSchema, surfaceId: surfaceIdSchema, actionId: actionIdSchema, values: uiActionValuesSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.plugin.invokeUiAction({
        caller: ctx.auth,
        pluginId: input.pluginId,
        surfaceId: input.surfaceId,
        actionId: input.actionId,
        values: input.values,
      }),
    ),

  // ── The U5 COMMAND pair (plugin-ui-plane §4.5). `listCommands` takes no input (the caller's own enabled
  //    plugins' commands — sweep-EXEMPT like `list`/`listSurfaces`). `invokeUiCommand` takes a FOREIGN pluginId
  //    AND a foreign chatId, so it is PROBED by the cross-tenant sweep on BOTH: the service gates the plugin on
  //    the owner-scoped `getById` and the chat through the same leak-free `resolveChatAuthority` the snippet
  //    gate uses (a chat the caller cannot read ⇒ NOT_FOUND, never an existence oracle).
  listCommands: authedProcedure.query(({ ctx }) => ctx.services.plugin.listCommands({ caller: ctx.auth })),

  invokeUiCommand: authedProcedure
    .input(
      z.object({
        pluginId: pluginIdSchema,
        name: z.string().regex(PLUGIN_COMMAND_NAME_RE),
        args: z.string().max(PLUGIN_COMMAND_ARGS_MAX),
        chatId: chatIdSchema.nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.plugin.invokeUiCommand({
        caller: ctx.auth,
        pluginId: input.pluginId,
        name: input.name,
        args: input.args,
        chatId: input.chatId,
      }),
    ),

  // ── The DISPLAY-transform round-trip (plugin-ui-plane seam 14, U6). Both are sweep-EXEMPT for the SAME
  //    reason `listSurfaces` is: neither takes a foreign id. `transformForDisplay` takes a chatId + messageId,
  //    but it READS nothing with them — they are handed to the guest as its `env`, and the only text in play is
  //    text the caller's own client supplied and only the caller receives back. Nothing is persisted, and no
  //    authority is derived from any input; the gate is the owner-scoped read of the caller's own plugin rows.
  listDisplayTransforms: authedProcedure.query(({ ctx }) => ctx.services.plugin.listDisplayTransforms({ caller: ctx.auth })),

  transformForDisplay: authedProcedure
    .input(z.object({ chatId: chatIdSchema, messageId: messageIdSchema, text: z.string().max(PLUGIN_DISPLAY_TEXT_MAX_CHARS) }))
    .query(({ ctx, input }) =>
      ctx.services.plugin.transformForDisplay({ caller: ctx.auth, chatId: input.chatId, messageId: input.messageId, text: input.text }),
    ),
});
