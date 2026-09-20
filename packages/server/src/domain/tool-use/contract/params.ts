// The registry entry contract. A `ToolDefinition` is `name + description + zod argsSchema + can()
// capability ceiling + handler`, registered once at `entry/compose` (collision = boot-fatal) and closed
// over its owning domain's service — tool-use never imports a registrant. `ToolDefinition` stays
// domain-internal (no client surface enumerates tools).

import type { ChatAction, ChatMembership, GlobalAction, ParticipantRole, Principal } from "@orb/contracts/identity";
import type { InvocationChat } from "@orb/contracts/plugin";
import type { ChatId, ChatTurnId, UserId } from "@orb/kit/ids";
import type { z } from "zod";
import type { AgentToolServer, AgentToolSpec, ToolCallInput } from "@orb/inference";

export type { ToolCallInput } from "@orb/inference";

/** The injected agent-sdk tool-server factory — the D47 barrel seam (`infra/providers`). tool-use depends
 *  DOWN on infra and receives the factory injected so tests stub it without an SDK dependency; `project-mcp`
 *  calls it with the wrapped specs only (name/version default). The real `createAgentToolServer` (which also
 *  accepts optional name/version) is assignable to this narrower shape. */
export type CreateAgentToolServer = (opts: { readonly tools: readonly AgentToolSpec[] }) => AgentToolServer;

/** Where a tool came from. `plugin` is LIVE: `registerPluginTool` (`contract/service.ts`) is wired at
 *  `entry/compose/automation-plugin.ts`, namespacing guest tools `plugin_<slug>_<name>`. Its ceiling
 *  resolves the INSTALLER's present role in the invocation chat (never the caller's).
 *
 *  BOTH AUTOMATION DOORS ARE BUILT (truth-repaired 2026-08-24; the previous "no arm reaches these
 *  tools" tense died with #648): the `run_tool` arm is a member of the action tuple
 *  (`contracts/automation/index.ts`), executed at `engine/arm-executors.ts` and composed at
 *  `entry/compose/automation-plugin.ts` (composed-real tested in
 *  `tests/server/entry/compose/automation-plugin.int.test.ts`); per-TURN attach rides the S2
 *  `toolNames` axis. Rules resolve tools AUTHOR-scoped through the per-owner registry partition
 *  (`substrate/partition.ts`, #677). */
export const TOOL_SOURCES = ["builtin", "plugin"] as const;
export type ToolSource = (typeof TOOL_SOURCES)[number];

/** The declarative can() ceiling the execute path checks before invoking the handler; the owning domain's
 *  verbs stay the authoritative gates underneath. `null` = member floor. */
export type ToolCapability = { readonly scope: "chat"; readonly action: ChatAction } | { readonly scope: "global"; readonly action: GlobalAction };

/** What a handler receives beside its parsed args. A handler needing anything else (a service, a db)
 *  closes over it at registration — never through this context. */
export interface ToolExecutionContext {
  readonly principal: Principal;
  readonly triggeredBy: UserId;
  /** `null` on non-chat consumers. */
  readonly chatId: ChatId | null;
  /** The turn's ephemeral identity (chat GATHER→loop), threaded so a turn-scoped registrant (rpg's staging
   *  accumulator, rpg-design/10 §R4) correlates a turn's tool writes to its commit/abort flush. `null` on a
   *  non-chat consumer (buddy). Inert until the rpg tool registrants land (R4 #2/#3). */
  readonly turnId: ChatTurnId | null;
  /** The caller's loaded membership, fed to can() for `scope:"chat"` ceilings. `null` when `chatId` is
   *  null — a chat-scoped tool executing then is an errors-as-data denial, never a crash. */
  readonly membership: ChatMembership | null;
  /** Cross-role cancellation, threaded from the turn; honoring it is the handler's job. */
  readonly signal?: AbortSignal | undefined;
}

/** What a handler returns: `ok:false` is a legality result the model narrates, distinct from a genuine bug
 *  (a throw, caught by execute). `value` must be JSON-serializable. */
export type ToolHandlerResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

/** A tool's handler. Args are already zod-parsed; a raw string never reaches a handler. */
export type ToolHandler<A> = (args: A, exec: ToolExecutionContext) => Promise<ToolHandlerResult>;

/** OpenAI function-name charset ∩ MCP tool-name charset — one name must survive both projections. */
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/u;

export interface ToolDefinition<A = unknown> {
  /** Registry key + the wire `function.name` (must match {@link TOOL_NAME_RE}). */
  readonly name: string;
  /** The model-facing contract: verb-first, states effects + when to call. Projected verbatim. */
  readonly description: string;
  /** The source of truth for the args (zod v4); projected to JSON Schema once at registration. */
  readonly argsSchema: z.ZodType<A>;
  /** The can() ceiling; `null` = member floor (see {@link ToolCapability}). */
  readonly capability: ToolCapability | null;
  readonly source: ToolSource;
  readonly handler: ToolHandler<A>;
}

/** The batch the loop hands execute (assembled by the stream reducer — the infra shape, one home). */
export type ToolCallBatch = readonly ToolCallInput[];

/** A RUNTIME plugin-tool registration (D48 source (b); plugin-design PL-A). Distinct from the compose-time
 *  `ToolDefinition` in three ways the landed shape forced: the args schema arrives as raw JSON Schema
 *  from an untrusted GUEST (lifted host-side to zod via `@orb/kit/json-schema` `liftJsonSchema` — PL-B; a
 *  guest cannot author zod); the ceiling runs as the INSTALLING principal, not the turn caller (PL-C); and
 *  registration is activation-time, so a collision is activation-fatal (not boot-fatal) and returns a
 *  {@link PluginToolHandle} the plugin deactivation deregisters (no ghost tools). `name` is ALREADY the
 *  namespaced `plugin_<slug'>_<name>` (the plugin domain namespaces before calling — tool-use stays
 *  plugin-agnostic); `invoke` runs the guest handler under its invocation budget (the infra port's `invoke`,
 *  curried over the resident instance + the guest handler ref). `chat` is the resident handler's invocation-chat
 *  scope — the registrar resolves the installer's read (admits) + host (`canWrite`) authority for the exec chat
 *  and threads it, so a plugin tool's guest handler sees the chat it was called from (`null` off-chat). */
export interface PluginToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly installer: Principal;
  readonly invoke: (argsJson: string, chat: InvocationChat | null) => Promise<string>;
  /** The INSTALLER's PRESENT participant role in an arbitrary chat — the PL-C ceiling's only honest input
   *  (`null` = not a present member of it). Injected per activation because the answer is a per-chat ROW READ
   *  and only the composition root may reach chat's roster — it binds chat's `loadPresentRole` over the db and
   *  the installer's own userId, the SAME op the transform registrar and the event fan-out already use.
   *
   *  Why an op and not `can()`: `can(installer, action, {kind:"chat", membership})` is a pure verdict over the
   *  membership HANDED IN, and the only membership at invocation time is the TURN CALLER's
   *  (`ToolExecutionContext.membership`) — so the read arm could never deny (`decideChat("read")` returns
   *  unconditionally) and the host arm answered "is the CALLER host", handing an installer `canWrite:true`
   *  inside a room they are not in. A ceiling over the wrong principal is not a ceiling. */
  readonly resolveInstallerRole: (chatId: ChatId) => Promise<ParticipantRole | null>;
}
