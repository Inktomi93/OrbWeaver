// The tool registry's definition data and the ops its consumers reach. Handler signatures and the resolved set
// stay with their domains; the registry itself lives in the server's tool-use domain.

import type { ChatId, ChatTurnId, UserId } from "@orb/kit/ids";
import type { z } from "zod";
import type { ChatAction, ChatMembership, GlobalAction, Principal } from "../identity/index.ts";
import type { ChatAuthority } from "../plugin/index.ts";

/** Where a tool came from. `plugin` tools are registered at activation through `RegisterPluginToolOp`,
 *  namespaced `plugin_<slug>_<name>`; their ceiling resolves the INSTALLER's present role in the invocation chat. */
const TOOL_SOURCES = ["builtin", "plugin"] as const;
export type ToolSource = (typeof TOOL_SOURCES)[number];

/** The declarative can() ceiling the execute path checks before invoking the handler; the owning domain's
 *  verbs stay the authoritative gates underneath. `null` = member floor. */
export type ToolCapability = { readonly scope: "chat"; readonly action: ChatAction } | { readonly scope: "global"; readonly action: GlobalAction };

/** What a handler receives beside its parsed args, less the cancellation signal (an `AbortSignal` is a runtime
 *  type, so the executing domain adds it). A handler needing anything else (a service, a db) closes over it at
 *  registration — never through this context. */
export interface ToolExecutionData {
  readonly principal: Principal;
  readonly triggeredBy: UserId;
  /** `null` on non-chat consumers. */
  readonly chatId: ChatId | null;
  /** The turn's ephemeral identity (chat GATHER→loop), threaded so a turn-scoped registrant correlates a
   *  turn's tool writes to its commit/abort flush. `null` on a non-chat consumer. */
  readonly turnId: ChatTurnId | null;
  /** The caller's loaded membership, fed to can() for `scope:"chat"` ceilings. `null` when `chatId` is
   *  null — a chat-scoped tool executing then is an errors-as-data denial, never a crash. */
  readonly membership: ChatMembership | null;
}

/** What a handler returns: `ok:false` is a legality result the model narrates, distinct from a genuine bug
 *  (a throw, caught by execute). `value` must be JSON-serializable. */
export type ToolHandlerResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

/** A registered tool's declared data: everything but its handler. */
export interface ToolDescriptor<A = unknown> {
  /** Registry key + the wire `function.name`. */
  readonly name: string;
  /** The model-facing contract: verb-first, states effects + when to call. Projected verbatim. */
  readonly description: string;
  /** The source of truth for the args (zod v4); projected to JSON Schema once at registration. */
  readonly argsSchema: z.ZodType<A>;
  /** The can() ceiling; `null` = member floor (see {@link ToolCapability}). */
  readonly capability: ToolCapability | null;
  readonly source: ToolSource;
}

/** A descriptor plus a handler that needs only the signal-free execution data. A registrant that never reads the
 *  turn's cancellation (rpg, imagery) types its tools with this; tool-use runs them through its own `ToolDefinition`. */
export interface ToolHandlerDefinition<A = unknown> extends ToolDescriptor<A> {
  readonly handler: (args: A, exec: ToolExecutionData) => Promise<ToolHandlerResult>;
}

/** A RUNTIME plugin-tool registration, less the guest `invoke` closure (it takes an `AbortSignal`, so the
 *  domains that run it declare it). The args schema arrives as raw JSON Schema from an untrusted guest; the
 *  ceiling runs as the INSTALLING principal, not the turn caller; `name` is already the namespaced
 *  `plugin_<slug'>_<name>`. */
export interface PluginToolSpecData {
  readonly name: string;
  readonly displayName?: string;
  readonly replayHistory?: boolean;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly installer: Principal;
  /** Fresh room authority for the captured INSTALLER. The caller's membership cannot authorize a resident
   *  tool: the injected chat operation reads the installer's seat before asking the kernel. */
  readonly resolveInstallerAuthority: (chatId: ChatId) => Promise<ChatAuthority>;
}

/** The deregistration handle a plugin registration returns. Deactivation calls `unregister` so a disabled
 *  plugin's tool never stays resolvable. */
export interface PluginToolHandle {
  readonly unregister: () => void;
}

/** Direct-drive reachability, the test half: may `userId` point at tool `name` themselves? */
export type IsToolDrivableByOp = (name: string, userId: UserId) => boolean;

/** Direct-drive reachability, the enumeration half: every contributor tool `userId` may drive right now. */
export type ListDrivableToolNamesOp = (userId: UserId) => readonly string[];

/** Resolve names against `driverUserId`'s view of the registry. The resolved set is opaque to a consumer:
 *  it names it as the type parameter and hands it back to the projection and execute ops. */
export type ResolveToolsOp<TSet> = (driverUserId: UserId, names: readonly string[]) => TSet;
