---
kind: spec
status: active
updated: 2026-07-03
---

# 01 — The Runtime and the Membrane: `PluginHostV1` in Full

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.** The
> typed surface a guest sees. This file IS the contract spec for `@orb/contracts/plugin` — a
> builder transcribes it, they do not design it.

---

## 0. The runtime (committed — see README for the permanent rejected list)

QuickJS-ng via `quickjs-emscripten`, in-process WASM. The WASM boundary makes host/guest memory
aliasing physically impossible; per-invocation interrupt handler + WASM memory cap = an enforceable
DoS budget (03 §3). The runtime lives ENTIRELY in `infra/plugin-host/` (an external-code adapter,
injected upward at compose — infra is a sealed executor; it never reaches into a domain). One
`QuickJSWASMModule` is loaded per process; each plugin/snippet gets its own
`QuickJSContext` (own globals, own memory cap, own interrupt budget).

## 1. The membrane principle (what "not a god-object" means, operationally)

1. **One frozen, versioned entry.** The guest global is empty except `orb`. The guest calls
   `orb.host(1)` once and receives a `PluginHostV1`. Nothing else is reachable — no `globalThis`
   escape hatches, no Node/DOM shims, no `Date`/`Math.random` (deleted from the guest realm and
   replaced by throwing stubs pointing at `host.clock`/`host.random` — determinism is enforced, not
   requested).
2. **Primitives + opaque handles across the boundary.** Every host-function argument/result is a
   JSON-safe primitive/array/object or an OPAQUE HANDLE (a branded string token the host mints and
   the guest cannot forge — validated + resolved host-side on every call). No live objects, no
   functions (except the registered callbacks the host invokes), no promises of host internals.
3. **Capability-gated at the FUNCTION, not the namespace.** Every host function names its required
   capability (02 §2); an ungranted call throws `PluginCapabilityError` — uniformly, so a guest
   can feature-detect by try/catch or by reading `host.grants`.
4. **The host performs all I/O.** A capability never hands the guest a socket/fd/db — it unlocks a
   host function whose body runs host-side under the plugin's principal, budgets, and validation.

## 2. `PluginHostV1` — the complete V1 surface (`@orb/contracts/plugin/host-v1.ts`)

```ts
// ── Opaque handles (branded strings; minted host-side; forged values fail resolution) ──────────
export type ChatHandle = Branded<"PluginChatHandle">;

/** What a handler/entry receives about ITS invocation context. */
export interface PluginInvocation {
  readonly chat: ChatHandle | null;      // null for a non-chat-scoped invocation (e.g. install hook)
  readonly reason: "event" | "tool" | "transform" | "snippet" | "activate";
}

// ── The surface ────────────────────────────────────────────────────────────────────────────────
export interface PluginHostV1 {
  readonly version: 1;
  /** The capabilities actually GRANTED (⊆ manifest.capabilities). Feature-detection surface. */
  readonly grants: readonly PluginCapability[];

  // Determinism — the ONLY time/entropy/id sources in the guest realm (README law).
  readonly clock: { nowEpochMs(): number };                       // injected clock (test-determinism)
  readonly random: { next(): number };                            // injected PRNG, [0,1)
  readonly ids: { mint(): string };                               // injected id factory (opaque uniqueness, NOT TypeIDs)

  readonly log: {                                                 // capability: none (always granted)
    info(msg: string): void; warn(msg: string): void; error(msg: string): void;
  };                                                              // rate-limited host-side (03 §3); surfaces in the plugin's log view

  readonly chat: {
    /** Resolve the invocation's chat. Throws outside a chat scope. capability: chat.read */
    current(): ChatHandle;
    /** Recent canon, oldest→newest, selected variants joined (D26), content capped 16 KiB/message.
     *  capability: chat.read */
    listMessages(chat: ChatHandle, opts?: { limit?: number /* ≤ 50, default 20 */ }): Promise<readonly PluginMessageView[]>;
    /** The runtime variable fold cache (read) — capability: chat.read */
    getVariables(chat: ChatHandle): Promise<Record<string, string>>;
    /** Variable writes ride the SAME delta seam actions use (automation-design/03 §1.1) —
     *  capability: chat.variables.write */
    applyVariableOps(chat: ChatHandle, ops: readonly PluginVariableOp[]): Promise<void>;
    /** Surface quick-reply chips (the automation bus event — automation-design/03 §1.4) —
     *  capability: chat.quick_reply */
    surfaceQuickReply(chat: ChatHandle, choices: readonly { label: string; sendText: string }[]): Promise<void>;
    /** Request an autonomous turn — capability: turn.trigger. Budget/consent-gated EXACTLY like the
     *  trigger_turn action (automation-design/03 §1.6/§3-4): the plugin's fires debit the chat's
     *  automation_budgets, carry initiator:"plugin" + automationDepth, and hit D17 unchanged. */
    requestTurn(chat: ChatHandle, p?: { speakerCharacterId?: string; guided?: string }): Promise<void>;
  };

  readonly worldInfo: {
    /** Same op + idempotency semantics as the insert_world_info_entry action (automation-design/03
     *  §1.3) — attached-book-only, entryKey-updatable, 64-entries-per-owner cap.
     *  capability: worldinfo.write */
    upsertEntry(chat: ChatHandle, e: PluginWorldEntryUpsert): Promise<void>;
  };

  readonly variables: {
    /** The INSTALLING PRINCIPAL's per-user global KV (automation-design/02 §4) — reads/writes are
     *  fetchOwned under that principal. capability: global_vars */
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };

  readonly storage: {
    /** Plugin-PRIVATE KV (per plugin × installing owner — the plugin_kv table, 02 §3). Distinct
     *  from `variables` (which is the USER's namespace, shared with macros/CEL). capability: storage.kv */
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;               // ≤ 64 KiB value, ≤ 256 keys/plugin
    delete(key: string): Promise<void>;
    list(prefix?: string): Promise<readonly string[]>;
  };

  readonly notifications: {
    /** capability: notify — the automation-notice path with recipient rules per
     *  automation-design/03 §1.5 (participants only, 200-char cap, cooldown floor). */
    post(chat: ChatHandle, recipient: "host" | "all_members", message: string): Promise<void>;
  };

  readonly imagery: {
    /** capability: imagery.generate — SPEND class, same ceilings as generate_image. Args = the
     *  SAME GenerateImageActionArgs shape the action arm imports (imagery-design/01 §6) — one
     *  vocabulary across rule, tool, and plugin. */
    generatePicture(chat: ChatHandle, p: GenerateImageActionArgs): Promise<{ assetId: string }>;
  };

  readonly events: {
    /** Subscribe to the Tier-1 trigger taxonomy — the SAME closed union (automation-design/01 §1);
     *  plugins get no private event vocabulary. Handlers receive the resolved TriggerFact (01 §2),
     *  never raw bus payloads. INSTALLED plugins only (snippets run once — 03 §1).
     *  capability: events.subscribe */
    on(type: ChatTriggerType | DomainTriggerType, handler: (fact: TriggerFact) => void | Promise<void>): void;
  };

  readonly tools: {
    /** Register a tool into the ONE domain/tool-use registry (D48 source (b)) — 03 §5.
     *  capability: tools.register */
    register(def: {
      name: string;                       // /^[a-z][a-z0-9_]{0,40}$/; host prefixes to
                                          // "plugin_<slug'>_<name>" (03 §5 — the tool-use charset)
      description: string;
      parameters: Record<string, unknown>;             // JSON Schema (validated host-side)
      handler: (args: unknown) => Promise<string>;     // runs IN the guest under the invocation budget
    }): void;
  };

  readonly transforms: {
    /** Register a D50 PromptTransform (automation-design/04 §6; order auto-assigned in the
     *  plugin band 1000+ by registration order). capability: chat.transform */
    register(def: {
      name: string;
      point: "user_input" | "assembled_dynamic";
      apply: (draft: string, env: { chatId: string; vars: Record<string, string> }) => Promise<string>;
    }): void;
  };

  readonly net: {
    /** capability: net.fetch — host-performed fetch, allowlisted per-manifest hosts ONLY (02 §2),
     *  GET/POST, 5 s deadline, 1 MiB response cap, no redirects off-allowlist, SSRF-guarded
     *  (the marinara safeFetch posture — Marinara-Residue §1 B5). */
    fetch(url: string, init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }):
      Promise<{ status: number; body: string }>;
  };
}
```

Supporting shapes (`PluginMessageView` — a REDUCED MessageView projection: id, role, author display
name, characterId, seq, content; no economics, no params, no promptSnapshot; `PluginVariableOp` —
the same `set/add/inc/dec/delete` op vocabulary the delta model defines; `PluginWorldEntryUpsert` —
mirror of the action's entry fields) live beside it in `@orb/contracts/plugin`. WHY a reduced
message view: `promptSnapshot`/`rawRequest` carry other participants' prompt internals and
credential-adjacent request metadata — the membrane's read floor is "what a member sees in the
transcript," nothing operator-tier.

**What V1 deliberately does NOT expose (asked-for-but-refused surface — record so it stays
refused):** raw DB/SQL (`getContext()`'s original sin) · preset/connection/credential reads (leak
vectors with zero legitimate plugin story) · message WRITE/edit (a plugin that edits canon is an
actor beyond review; the propose-don't-dispose crew pattern is the home for that capability if ever
wanted — criterion: a real plugin request, argued through a ledger decision) · arbitrary event
EMISSION onto either bus (closed unions; a plugin-emitted event would be a forged domain fact) ·
DOM/UI beyond quick-reply chips (the client extension story is a separate, undesigned surface —
NOT this membrane).

## 3. Versioning + failure-on-V2 semantics

- `orb.host(requestedMajor)` — the ONLY negotiation point. Host serves major 1 → `orb.host(1)`
  returns the surface; `orb.host(2)` throws `HostVersionError{requested:2, served:[1]}` at
  ACTIVATION, which fails the plugin's activation loudly (row → `errored`, host notified) — a
  V2-compiled plugin never half-runs on V1. Symmetrically, when V2 ships, V1 remains served by an
  adapter for ≥ one major cycle OR `orb.host(1)` throws the same typed error — loud, never silent
  degradation (the D46 "fails loudly on V2" clause, made mechanical).
- **Within V1: additive-optional evolution only.** New OPTIONAL namespaces/methods may appear
  (guests feature-detect via `"tools" in host` / `host.grants`); no signature, semantics, or
  removal changes ever — those are V2. The manifest pins `hostVersion: 1` (02 §1) so the store can
  refuse incompatible installs before code runs. WHY additive-within-major over hard-frozen: a
  hard freeze forces V2 for every new capability, and capability GROWTH is the expected evolution
  (the manifest gate already makes new capabilities opt-in); breaking changes are what versions are
  for. *(Rejected: semver-range negotiation à la npm — a membrane serving N ranges is N membranes;
  one integer, one adapter policy.)*
- The `version: 1` field + `grants` are data, so a plugin can log its own compatibility surface.

## 4. Homes + the gate

| Piece | Home |
|---|---|
| `PluginHostV1` + handles + manifest schema + capability tuple | `@orb/contracts/plugin` |
| QuickJS runtime, membrane impl (handle minting, marshalling, budgets, realm setup) | `infra/plugin-host/` |
| registry/lifecycle/grants/KV (02) | `domain/plugin/` (8-slot leaf) |
| snippet entry (chat transport verb → host) | `transport` → `domain/plugin` → `infra/plugin-host` |

**Gate `plugin-no-ambient` (dep-cruiser + review):** `infra/plugin-host/**` imports NOTHING from
`domain/**` (it is handed `PluginHostOps` — the op bundle `domain/plugin` assembles — at compose);
the guest realm setup test pins that `Date.now`, `Math.random`, `setTimeout`, `fetch`, and
`globalThis.orb.host` internals are absent/stubbed (04's escape suite).
