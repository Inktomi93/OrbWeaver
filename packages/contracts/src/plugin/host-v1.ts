// @orb/contracts/plugin — the `PluginHostV1` membrane surface in full (plugin-design/01 §2). The ONE typed
// thing a guest sees: the frozen, versioned, capability-gated surface it receives from `orb.host(1)` — the
// antithesis of ST's `getContext()` god-object. Only JSON-safe primitives and OPAQUE HANDLES cross the
// boundary; every host function is gated at the FUNCTION (not the namespace) by a `PluginCapability`, and the
// clock/PRNG/id sources are injected (determinism is enforced, not requested — `test-determinism`). This file
// is pure wire vocabulary (types + the capability→function completeness map); the runtime that implements it is
// `infra/plugin-host`, wired at compose with the `domain/plugin` op bundle — infra never imports a domain.

import type { Branded } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { ChatTriggerType, DomainTriggerType, TriggerFact } from "#automation";
import type { GenerateImageActionArgs } from "#imagery";
import type { PluginCapability } from "./manifest";

// ── Opaque handles (branded strings; minted host-side; forged values fail resolution) ──────────────────────
export type ChatHandle = Branded<"PluginChatHandle">;

/** The `host.log` severity axis (01 §2) — the ONE home for the plugin log levels: the membrane surface exposes
 *  `log.{info,warn,error}`, the `domain/plugin` `PluginLogView` derives its `level` from this, and the
 *  `infra/plugin-host` log ring speaks it. Declared once here (the wire vocab home) so no consumer re-spells it. */
export const PLUGIN_LOG_LEVELS = ["info", "warn", "error"] as const;
export type PluginLogLevel = (typeof PLUGIN_LOG_LEVELS)[number];

/** A REDUCED `MessageView` projection: the read floor is "what a member sees in the transcript" — no economics,
 *  no params, no `promptSnapshot`/`rawRequest` (those carry other participants' prompt internals + credential-
 *  adjacent request metadata; operator-tier, never plugin-tier). */
export interface PluginMessageView {
  readonly id: string;
  readonly role: MessageRole;
  readonly authorDisplayName: string;
  readonly characterId: string | null;
  readonly seq: number;
  readonly content: string;
}

/** The same `set`/`add`/`inc`/`dec`/`delete` op vocabulary the delta model defines — the ONE home is the kit
 *  `VarOp` (aliased, never re-spelled); a guest write rides the SAME delta seam actions use (03 §1.1). */
export type PluginVariableOp = VarOp;

/** Mirror of the `insert_world_info_entry` action's entry fields (03 §1.3) — attached-book-only, entryKey-
 *  updatable, host-side idempotent. */
export interface PluginWorldEntryUpsert {
  readonly bookId: string;
  readonly entryKey: string;
  readonly keys: readonly string[];
  readonly contentTemplate: string;
  readonly position: "before" | "after";
}

/** What a handler/entry receives about ITS invocation context. */
export interface PluginInvocation {
  readonly chat: ChatHandle | null; // null for a non-chat-scoped invocation (e.g. install hook)
  readonly reason: "event" | "tool" | "transform" | "snippet" | "activate";
}

// ── The surface ────────────────────────────────────────────────────────────────────────────────────────────
export interface PluginHostV1 {
  readonly version: 1;
  /** The capabilities actually GRANTED (⊆ manifest.capabilities). Feature-detection surface. */
  readonly grants: readonly PluginCapability[];

  // Determinism — the ONLY time/entropy/id sources in the guest realm (README law).
  readonly clock: { nowEpochMs: () => number }; // injected clock (test-determinism)
  readonly random: { next: () => number }; // injected PRNG, [0,1)
  readonly ids: { mint: () => string }; // injected id factory (opaque uniqueness, NOT TypeIDs)

  readonly log: {
    // capability: none (always granted); rate-limited host-side (03 §3); surfaces in the plugin's log view
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };

  readonly chat: {
    /** Resolve the invocation's chat. Throws outside a chat scope. capability: chat.read */
    current: () => ChatHandle;
    /** Recent canon, oldest→newest, selected variants joined (D26), content capped 16 KiB/message.
     *  capability: chat.read */
    listMessages: (chat: ChatHandle, opts?: { limit?: number /* ≤ 50, default 20 */ }) => Promise<readonly PluginMessageView[]>;
    /** The runtime variable fold cache (read) — capability: chat.read */
    getVariables: (chat: ChatHandle) => Promise<Record<string, string>>;
    /** Variable writes ride the SAME delta seam actions use (03 §1.1) — capability: chat.variables.write */
    applyVariableOps: (chat: ChatHandle, ops: readonly PluginVariableOp[]) => Promise<void>;
    /** Surface quick-reply chips (the automation bus event — 03 §1.4) — capability: chat.quick_reply */
    surfaceQuickReply: (chat: ChatHandle, choices: readonly { label: string; sendText: string }[]) => Promise<void>;
    /** Request an autonomous turn — capability: turn.trigger. Budget/consent-gated EXACTLY like the
     *  trigger_turn action (03 §1.6/§3-4): debits the chat's automation_budgets, carries
     *  initiator:"plugin" + automationDepth, and hits D17 unchanged. */
    requestTurn: (chat: ChatHandle, p?: { speakerCharacterId?: string; guided?: string }) => Promise<void>;
  };

  readonly worldInfo: {
    /** Same op + idempotency semantics as the insert_world_info_entry action (03 §1.3) — attached-book-only,
     *  entryKey-updatable, 64-entries-per-owner cap. capability: worldinfo.write */
    upsertEntry: (chat: ChatHandle, e: PluginWorldEntryUpsert) => Promise<void>;
  };

  readonly variables: {
    /** The INSTALLING PRINCIPAL's per-user global KV (02 §4) — reads/writes are fetchOwned under that
     *  principal. capability: global_vars */
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };

  readonly storage: {
    /** Plugin-PRIVATE KV (per plugin × installing owner — the plugin_kv table, 02 §3). Distinct from
     *  `variables` (the USER's namespace, shared with macros/CEL). capability: storage.kv */
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>; // ≤ 64 KiB value, ≤ 256 keys/plugin
    delete: (key: string) => Promise<void>;
    list: (prefix?: string) => Promise<readonly string[]>;
  };

  readonly notifications: {
    /** capability: notify — the automation-notice path with recipient rules per 03 §1.5 (participants only,
     *  200-char cap, cooldown floor). */
    post: (chat: ChatHandle, recipient: "host" | "all_members", message: string) => Promise<void>;
  };

  readonly imagery: {
    /** capability: imagery.generate — SPEND class, same ceilings as generate_image. Args = the SAME
     *  GenerateImageActionArgs shape the action arm imports (imagery-design/01 §6) — one vocabulary across
     *  rule, tool, and plugin. */
    generatePicture: (chat: ChatHandle, p: GenerateImageActionArgs) => Promise<{ assetId: string }>;
  };

  readonly events: {
    /** Subscribe to the Tier-1 trigger taxonomy — the SAME closed union (automation-design/01 §1); plugins
     *  get no private event vocabulary. Handlers receive the resolved TriggerFact (01 §2), never raw bus
     *  payloads. INSTALLED plugins only (snippets run once — 03 §1). capability: events.subscribe */
    on: (type: ChatTriggerType | DomainTriggerType, handler: (fact: TriggerFact) => void | Promise<void>) => void;
  };

  readonly tools: {
    /** Register a tool into the ONE domain/tool-use registry (D48 source (b)) — 03 §5. The host-side posture
     *  for the raw-JSON-Schema `parameters` field is the named P4 decision against D79 (README truth table).
     *  capability: tools.register */
    register: (def: {
      name: string; // /^[a-z][a-z0-9_]{0,40}$/; host prefixes to "plugin_<slug'>_<name>" (03 §5)
      description: string;
      parameters: Record<string, unknown>; // JSON Schema (validated host-side)
      handler: (args: unknown) => Promise<string>; // runs IN the guest under the invocation budget
    }) => void;
  };

  readonly transforms: {
    /** Register a D50 PromptTransform (automation-design/04 §6; order auto-assigned in the plugin band 1000+
     *  by registration order). capability: chat.transform */
    register: (def: {
      name: string;
      point: "user_input" | "assembled_dynamic";
      /** The re-entry passes ONE structured-clone-safe object (the single-arg host→guest invoke seam tools +
       *  events already use — a named field bag is arity-stable: adding an env field never changes the call
       *  shape). `input.draft` is the working text; `input.env` = `{chatId, vars}` for a sync read inside the
       *  250 ms transform deadline (no host round-trip needed). Return the transformed draft. */
      apply: (input: { draft: string; env: { chatId: string; vars: Record<string, string> } }) => Promise<string>;
    }) => void;
  };

  readonly net: {
    /** capability: net.fetch — host-performed fetch, allowlisted per-manifest hosts ONLY (02 §2), GET/POST,
     *  5 s deadline, 1 MiB response cap, no redirects off-allowlist, SSRF-guarded (infra/network safeFetch,
     *  D61 B5a). */
    fetch: (url: string, init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; body: string }>;
  };
}

// ── The capability → host-function completeness pin (02 §2's enforcement table, coded) ─────────────────────
/** Namespaces reachable with NO capability: the determinism/id floor + the version/feature-detect surface.
 *  The ONE tuple (derive, never re-spell — §7.5); a `satisfies` pins every member to a real `PluginHostV1` key,
 *  so a renamed/removed free namespace fails `tsc` here. */
const PLUGIN_FREE_NAMESPACES = ["version", "grants", "clock", "random", "ids", "log"] as const satisfies readonly (keyof PluginHostV1)[];
type FreeNamespace = (typeof PLUGIN_FREE_NAMESPACES)[number];
/** Every namespace whose functions are capability-gated. */
type GatedNamespace = Exclude<keyof PluginHostV1, FreeNamespace>;
/** A `"namespace.method"` reference for every capability-gated host function, DERIVED from the surface — the
 *  set the map below must exactly cover. Adding a gated method widens this union; if the map does not claim it,
 *  the reverse-completeness pin (tests/contracts/plugin/index.test-d.ts) goes red. */
export type HostFunctionRef = {
  [Ns in GatedNamespace]: `${Ns & string}.${keyof PluginHostV1[Ns] & string}`;
}[GatedNamespace];

/** The 02 §2 capability→function map as CODE, keyed by FUNCTION (the per-call lookup the host performs). Both
 *  completeness directions are `tsc`-enforced: `satisfies Record<HostFunctionRef, …>` forces EVERY gated
 *  function to name a capability — a new gated method with no entry is a missing key (RED); the `PluginCapability`
 *  value type makes a capability that does not exist fail (RED). The reverse — a capability claimed by NO
 *  function — is the `.test-d.ts` value-coverage equality pin. Together: the P2 completeness checkpoint. */
export const HOST_FUNCTION_CAPABILITY = {
  "chat.current": "chat.read",
  "chat.listMessages": "chat.read",
  "chat.getVariables": "chat.read",
  "chat.applyVariableOps": "chat.variables.write",
  "chat.surfaceQuickReply": "chat.quick_reply",
  "chat.requestTurn": "turn.trigger",
  "worldInfo.upsertEntry": "worldinfo.write",
  "variables.get": "global_vars",
  "variables.set": "global_vars",
  "variables.delete": "global_vars",
  "storage.get": "storage.kv",
  "storage.set": "storage.kv",
  "storage.delete": "storage.kv",
  "storage.list": "storage.kv",
  "notifications.post": "notify",
  "imagery.generatePicture": "imagery.generate",
  "events.on": "events.subscribe",
  "tools.register": "tools.register",
  "transforms.register": "chat.transform",
  "net.fetch": "net.fetch",
} as const satisfies Record<HostFunctionRef, PluginCapability>;
