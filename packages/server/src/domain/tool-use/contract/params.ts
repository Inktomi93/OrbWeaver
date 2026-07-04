// domain/tool-use/contract/params — the registry entry contract (tool-use-design/01 §1). The ONE
// tool vocabulary both projections serve: a `ToolDefinition` is `name + description + zod argsSchema +
// can() capability ceiling + handler`, registered ONCE at `entry/compose` (collision = boot-fatal) and
// closed over its owning domain's service — tool-use never imports a registrant (the compose-wired
// closure idiom, rpg-design/05 §0 / buddy.md generalized). `ToolDefinition` stays DOMAIN-INTERNAL
// (committed doc §8 Q2: no client surface enumerates tools; the flip criterion is a committed
// tool-picker UI). `ToolCallInput` is the infra wire contract's shape re-exported DOWN-imported (the
// reducer assembles it — one declaration, tool-use-design/02 §6). `ToolHandlerResult` lives HERE with
// the handler type (results.ts re-exports it — a params→results import would be a contract cycle).

import type { ChatAction, ChatRoster, GlobalAction, Principal } from "@orb/contracts/identity";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { z } from "zod";
import type { ToolCallInput } from "#infra/providers";

export type { ToolCallInput } from "#infra/providers";

/** Where a tool came from. `plugin` is RESERVED (D46 Tier-2) — the member exists so the plugin host
 *  lands additively (manifest tools register through the same verb with `source:"plugin"` + a
 *  manifest-derived ceiling); NOTHING plugin-shaped is built now. */
export const TOOL_SOURCES = ["builtin", "plugin"] as const;
export type ToolSource = (typeof TOOL_SOURCES)[number];

/** The declarative can() ceiling the execute path checks BEFORE invoking the handler (01 §5 — belt
 *  one; the owning domain's verbs stay the authoritative gates underneath, belt two). Mirrors the
 *  `Can` overload split: a chat-scoped action pairs only with a chat resource, a global action only
 *  with global. `null` = member floor — no privileged authority beyond "this principal may run this
 *  turn at all" (which the CALLER already proved before executing anything). */
export type ToolCapability =
  | { readonly scope: "chat"; readonly action: ChatAction }
  | { readonly scope: "global"; readonly action: GlobalAction };

/** What a handler receives beside its parsed args: the turn's IDENTITY frame (D19 — the principal is
 *  the host acting on a chat turn / the owner on a buddy ask; `triggeredBy` is the responsible human).
 *  A handler needing anything else (a service, a db) closes over it at registration — never through
 *  this context (tool-use owns no db). */
export interface ToolExecutionContext {
  readonly principal: Principal;
  readonly triggeredBy: UserId;
  /** `null` on non-chat consumers (buddy's ask has no chatId — buddy.md invariant #2). */
  readonly chatId: ChatId | null;
  /** The caller's loaded membership, fed to can() for `scope:"chat"` ceilings (chat loads the roster,
   *  can() decides). `null` when `chatId` is null — a chat-scoped tool executing then is an
   *  errors-as-data denial, never a crash. */
  readonly roster: ChatRoster | null;
  /** Cross-role cancellation, threaded from the turn; honoring it is the HANDLER's job. */
  readonly signal?: AbortSignal | undefined;
}

/** What a handler returns: `ok:false` is a LEGALITY result the model narrates ("the attack misses"),
 *  distinct from a genuine bug (a throw, caught by execute) — both become errors-as-data records, but
 *  the union keeps the intentional path visible in every handler's types (01 §5). `value` must be
 *  JSON-serializable; execute owns the ONE stringify site. */
export type ToolHandlerResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/** A tool's handler. Args are ALREADY zod-parsed (the ONE parse site is execute — 01 §5 step 2);
 *  a raw string never reaches a handler. */
export type ToolHandler<A> = (args: A, exec: ToolExecutionContext) => Promise<ToolHandlerResult>;

/** OpenAI function-name charset ∩ MCP tool-name charset — one name must survive both projections. */
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/u;

export interface ToolDefinition<A = unknown> {
  /** Registry key + the wire `function.name` (must match {@link TOOL_NAME_RE}). */
  readonly name: string;
  /** The model-facing contract: verb-first, states effects + when to call. Projected verbatim. */
  readonly description: string;
  /** THE source of truth for the args (zod v4); projected to JSON Schema ONCE at registration
   *  (substrate/json-schema — the same rule serves `ResponseFormat.schema`, 04 §1). */
  readonly argsSchema: z.ZodType<A>;
  /** The can() ceiling; `null` = member floor (see {@link ToolCapability}). */
  readonly capability: ToolCapability | null;
  readonly source: ToolSource;
  readonly handler: ToolHandler<A>;
}

/** The batch the loop hands execute (assembled by the stream reducer — the infra shape, one home). */
export type ToolCallBatch = readonly ToolCallInput[];
