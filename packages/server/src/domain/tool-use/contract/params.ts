// The registry entry contract. A `ToolDefinition` is `name + description + zod argsSchema + can()
// capability ceiling + handler`, registered once at `entry/compose` (collision = boot-fatal) and closed
// over its owning domain's service — tool-use never imports a registrant. `ToolDefinition` stays
// domain-internal (no client surface enumerates tools).

import type { ChatAction, ChatRoster, GlobalAction, Principal } from "@orb/contracts/identity";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { z } from "zod";
import type { ToolCallInput } from "#infra/providers";

export type { ToolCallInput } from "#infra/providers";

/** Where a tool came from. `plugin` is reserved — nothing plugin-shaped is built now. */
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
  /** The caller's loaded membership, fed to can() for `scope:"chat"` ceilings. `null` when `chatId` is
   *  null — a chat-scoped tool executing then is an errors-as-data denial, never a crash. */
  readonly roster: ChatRoster | null;
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
