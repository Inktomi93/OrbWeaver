# 01 — The Registry: Entry Contract, Execution Path, `can()` Gating, Registration

> **Status: COMMITTED (D48) — prescriptive design; the ledger D-entry, then
> [`domains/tool-use.md`](../../domains/tool-use.md), win on any conflict.** This doc makes the
> committed doc's §4 skeleton buildable: every shape inline, every seam named.

---

## 0. The 8-slot home (recap + the one correction)

The layout is the committed doc's §4 verbatim, with the contract files fleshed out below. ONE
correction to a §4 parenthetical: the registry is **process-lifetime, built once at
`entry/compose`** — NOT "in-memory per request". rpg-design/05 §3 (committed, D58) says
"registered once at compose"; a per-request rebuild would re-run every registrant's closure setup
on every turn for zero benefit (the tool SET is static per deploy; per-turn variance is the
ATTACHMENT axis, §4 below). The §4 parenthetical meant "no DB persistence" — flagged in
[`05 §review-flags`](05-build-plan-and-resolutions.md), not a re-decision of anything ledgered.
*(Rejected: per-request registries — they'd also break `project-wire`'s cached JSON-schema
projection, §2.)*

```
domain/tool-use/
├── index.ts          FRONT DOOR — ToolUseService interface + factory
├── service.ts        COMPOSITION ROOT — zero logic
├── context.ts        DI BUNDLE — ToolUseContext { can, clock }
├── contract/
│   ├── service.ts    ToolUseService
│   ├── params.ts     ToolDefinition, ToolCapability, ToolExecutionContext, ToolCallInput
│   ├── results.ts    ToolHandlerResult, ResolvedToolSet (+ re-export ToolCallRecord from @orb/contracts/chat)
│   └── errors.ts     ToolNameCollisionError, ToolNotFoundError
├── verbs/
│   ├── register.ts       register(def) — compose-time only; collision = throw
│   ├── resolve.ts        resolveTools(names) → ResolvedToolSet — the per-turn read surface
│   ├── execute.ts        executeToolCalls(calls, exec) → ToolCallRecord[] — sequential, errors-as-data
│   ├── project-wire.ts   toWireTools(set) → WireTool[]                    (02 §2)
│   └── project-mcp.ts    toAgentToolServer(set, exec, deps) → AgentToolServer (02 §3)
├── persistence/      (none — no tables; ToolCallRecords persist via chat persistence on the variant)
└── substrate/
    ├── capability.ts     checkToolCapability(entry, exec, can) — the gate (§5)
    └── json-schema.ts    projectArgSchema(zodSchema) → JSON Schema     (§2)
```

`ToolUseContext` is deliberately thin: `can` (the injected `@orb/contracts/identity` `Can` seam —
the same injection chat uses, never an admin import) and `clock` (for `durationMs`; injected —
test-determinism law). There is NO `db` in the context: the domain owns no tables and handlers
reach their own domain's persistence through their closures (§1), never through tool-use.
*(Rejected: the committed §4 sketch's `{ db, executeHandler, clock }` bundle — `db` with no tables
is a junk-drawer invitation, and `executeHandler` as an injected op inverts ownership: executing
IS this domain's verb.)*

## 1. The registry entry — the full contract (`contract/params.ts`)

```ts
import type { Can, ChatAction, ChatRoster, GlobalAction, Principal } from "@orb/contracts/identity";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { z } from "zod";

/** Where a tool came from. `plugin` is RESERVED (D46 Tier-2) — the member exists so the D46 plugin
 *  host lands additively (a plugin manifest's tools register through the same verb with
 *  `source:"plugin"` + a manifest-derived capability ceiling); NOTHING plugin-shaped is built now. */
export const TOOL_SOURCES = ["builtin", "plugin"] as const;
export type ToolSource = (typeof TOOL_SOURCES)[number];

/** The declarative can() ceiling the execute path checks before invoking the handler (§5).
 *  Mirrors the Can overload split (identity contract): a chat-scoped action pairs only with a
 *  chat resource, a global action only with global. `null` = member floor — no privileged
 *  authority beyond "this principal may run this turn at all" (which the CALLER already proved:
 *  chat's turn pipeline ran can(read) to start the turn; buddy's ask is owner-scoped). */
export type ToolCapability =
  | { readonly scope: "chat"; readonly action: ChatAction }     // "read" | "host"
  | { readonly scope: "global"; readonly action: GlobalAction }; // "admin" | "owner"

export interface ToolDefinition<A = unknown> {
  /** Registry key + the wire `function.name`. Must match /^[a-z][a-z0-9_]{0,63}$/ (OpenAI's
   *  function-name charset ∩ MCP tool-name charset — one name survives both projections). */
  readonly name: string;
  /** The model-facing contract: verb-first, states effects + when to call. Projected verbatim. */
  readonly description: string;
  /** THE source of truth for the args. zod v4 (workspace catalog ^4.4.3); projected to JSON
   *  Schema once at registration (§2). Handlers receive the PARSED value — never a raw string. */
  readonly argsSchema: z.ZodType<A>;
  /** The can() ceiling. `null` = member floor (see type doc above). */
  readonly capability: ToolCapability | null;
  readonly source: ToolSource;
  readonly handler: ToolHandler<A>;
}

/** What a handler receives. Args are ALREADY zod-parsed. The exec context is the turn's identity
 *  frame — a handler that needs anything else (a service, a db) closes over it (§3). */
export type ToolHandler<A> = (args: A, exec: ToolExecutionContext) => Promise<ToolHandlerResult>;

export interface ToolExecutionContext {
  /** The turn principal. On a chat turn this is the HOST acting (D19 runAsUserId — the GM/agent
   *  acts with host authority; rpg-design/05 §3). On a buddy ask it is the buddy's owner. */
  readonly principal: Principal;
  /** The human RESPONSIBLE for the turn existing (D19 triggeredBy — spend/abort/attribution). */
  readonly triggeredBy: UserId;
  /** The chat this turn belongs to; null on non-chat consumers (buddy's ask has no chatId until
   *  buddy becomes a participant — buddy.md invariant #2). */
  readonly chatId: ChatId | null;
  /** The caller's loaded membership, fed to can() for scope:"chat" ceilings (the identity-contract
   *  pattern: chat loads the roster, can() decides — chat never compares role itself). null when
   *  chatId is null; a scope:"chat" tool executing with a null roster is an errors-as-data denial. */
  readonly roster: ChatRoster | null;
  /** Cross-role cancellation, threaded from the turn. */
  readonly signal?: AbortSignal | undefined;
}

/** The wire shape of one model-emitted call (the assistant variant's tool-call parts, 02 §1). */
export interface ToolCallInput {
  readonly toolCallId: string;
  readonly name: string;
  /** RAW JSON string exactly as the model emitted it — parsed exactly once, inside execute. */
  readonly arguments: string;
}
```

**WHY zod-in / JSON-string-boundary:** the model speaks raw JSON strings; the handler wants a
typed value; there must be exactly ONE parse site so a malformed-args failure has one home and one
error shape (execute, §4). ST parses inside `invokeFunctionTool` too (`tool-calling.js:325` —
one-line cite); orbweaver adds the zod validation ST lacks. *(Rejected: handlers receiving the raw
string — every handler re-implements parse+validate, the exact drift D48's one-registry rule
exists to kill. Rejected: a parsed-but-unvalidated `unknown` — pushes validation into 23+ rpg
handlers.)*

**WHY a capability field per entry instead of trusting handlers:** the registry gate is the
CEILING (belt one — a tool cannot be invoked beyond its declared authority even if a handler
forgets its own check); the owning domain's verbs remain the authoritative gates underneath
(belt two — rpg's `requireGmSeat`, buddy's confirm gate). One capability model, two belts, per
D46's "one runtime, one capability model". *(Rejected: gate-only-in-handlers — a plugin-sourced
tool (D46) would then be gated by code the plugin author wrote.)*

**ST features deliberately NOT ported:** `shouldRegister` (a per-request async gate) is replaced
by the ATTACHMENT axis (§4 — the caller decides per turn which names ride; a per-entry async
callback is a hidden second attachment mechanism). `stealth` (hide result + suppress recurse) has
no registrant that needs it — rpg's `offer_choices` gets "terminal" behavior by reminder
convention instead (rpg-design/05 §3 #22); a control-flow flag on a registry entry is a hidden
channel into chat's loop. Reserved-additive: either can land later as an optional field without
touching any existing entry. *(Rejected: porting both "because ST has them" — the exact
carry-a-neo-pattern reflex AGENTS-1 warns about.)*

## 2. The zod → JSON-schema projection rule (`substrate/json-schema.ts`)

```ts
/** Project a tool's zod arg schema to the wire JSON Schema. Computed ONCE at registration and
 *  cached on the registry entry (deterministic — no per-turn cost, no drift between turns). */
export function projectArgSchema(schema: z.ZodType): Record<string, unknown>;
```

Rules (all three enforced by a golden contract test, 05 §T3):

1. **`z.toJSONSchema(schema)`** — zod v4's native projector (the workspace is zod ^4.4.3; no
   `zod-to-json-schema` dependency). Target draft 2020-12, which OpenAI-wire `tools[]` accepts.
2. **`additionalProperties: false` pinned on every object node** (post-walk). This is neo's vLLM
   `cleanJsonSchema` rule generalized (one-line cite: `vllm/runners/chat-completion.ts`) and
   OpenAI's strict-mode requirement — a model inventing extra keys fails validation at OUR parse,
   not silently downstream.
3. **Descriptions survive** — `.describe()` on zod fields is the per-arg model documentation;
   the projector must not strip it (the description IS prompt surface).

The SAME projector serves `ResponseFormat.schema` on the structured-output axis (04 §1) — one
projection rule for both axes. *(Rejected: hand-authored JSON Schema per tool (ST's model —
`parameters` is a raw schema object): two sources of truth per tool, and the handler's parse
schema drifts from the wire schema — the exact bug class zod-as-source kills.)*

## 3. The owning-domain closure pattern (the registration idiom)

**A registry entry closes over the service(s) it needs; tool-use never imports a domain.** This is
the documented idiom, verbatim from the committed consumers:

- rpg: "the registry entries close over the rpg service (the same closure pattern buddy's MCP
  tools use)" — rpg-design/05 §0.
- buddy: "handlers close over `(db, userId)` so a tool can't act as another user" — buddy.md
  registry table.

Concretely, at `entry/compose`:

```ts
// entry/compose (sketch — the ONLY place register is called)
const toolUse = createToolUseService({ can, clock });
for (const def of rpgToolDefinitions(rpgService)) toolUse.register(def);   // 23 defs, rpg-design/05 §3
for (const def of buddyToolDefinitions(db)) toolUse.register(def);          // buddy's status/counts + propose_* set
```

Each domain exports a `xToolDefinitions(deps) → readonly ToolDefinition[]` factory from its front
door — the defs live WITH their owner (rpg owns its tool contracts in `domain/rpg/contract/
tools.ts`; buddy in `domain/buddy/agent/tools.ts`), and tool-use owns only the registry mechanics.
Import direction is clean: `entry` imports both and wires them together; `domain/rpg` and
`domain/tool-use` never import each other (dep-cruiser enforced — the rpg-design/05 §0 rule
generalized to every registrant). *(Rejected: tool-use importing registrants to self-populate —
an upward domain→domain reach and a new edit-this-file-per-feature hub. Rejected: registrants
importing tool-use's front door to self-register at module load — import-time side effects, and
the composition root loses the wiring inventory.)*

## 4. Registration vs attachment — two axes, two verbs

**Registration** (process-lifetime, compose-time): `register(def)` inserts into the one `Map`.

- **Name collision = `ToolNameCollisionError`, thrown, boot-fatal.** WHY: a duplicate name is a
  wiring bug (or, later, a plugin squatting on a builtin name — a security posture, not a UX one);
  the env spine's `superRefine` boot-fatality is the precedent — fail at compose, never at turn
  time. *(Rejected: last-write-wins — silently lets a plugin shadow `skill_check`. Rejected:
  first-write-wins + warn — a warning nobody reads is a silent override with extra steps.)*
- **Idempotency: none needed.** compose runs once per process; calling `register` twice with the
  same def IS the collision case. A test helper may construct a fresh service per test instead of
  clearing (no `unregister` verb in v1 — no consumer; reserved-additive for D46 plugin unload,
  whose criterion is "the plugin host lands").

**Attachment** (per-turn): which registered tools ride THIS request. The registry's read surface:

```ts
/** Resolve caller-supplied names against the registry. Unknown name = ToolNotFoundError (THROWN —
 *  at attach time an unknown name is OUR wiring bug: registrants attach names they registered;
 *  contrast §5's execute-time unknown, which is the MODEL's bug and errors-as-data). */
resolveTools(names: readonly string[]): ResolvedToolSet;
```

`ResolvedToolSet` is an opaque ordered collection of registry entries (+ their cached JSON-schema
projections) that both projections and `executeToolCalls` accept — resolving once per turn, then
projecting and executing against the SAME set, guarantees the tools the model saw are exactly the
tools that can run. The known attachment flows:

| Caller | Attachment source | Notes |
|---|---|---|
| chat turn (rpg game) | `RpgGatherResult.tools: readonly string[]` — GATHER contributes names, chat resolves (rpg-design/05 §1) | varies per turn: overworld vs encounter set |
| chat turn (plain, v1) | NONE — no builtin chat tools exist yet; `tools[]` never attaches, request is byte-identical to pre-D48 | character-attached tools are the deferred future (db `toolCalls` comment: "character tools deferred, chat.md Part III") |
| buddy `ask` | buddy's own curated names → `resolveTools` → `project-mcp` | D47 path; the SDK loops |
| crew members | **NONE — ever** (D59; chat-crew-design/05 §b: "no member registers in the registry; no member's run recurses") | crew consumes the structured-output axis ONLY (04) |
| D46 plugins | reserved: manifest-declared tools register at plugin activation with `source:"plugin"` | NOT built now; the `source` field + collision posture are the whole reserved seam |

*(Rejected: a per-chat `chat_tools` junction table for attachment — no consumer configures tools
per chat today; rpg attaches per TURN (mode-dependent) which a table cannot express, and buddy
attaches per feature. Attachment is a runtime argument, not state. The criterion that flips this:
a user-facing per-chat tool-picker UI — the committed doc §8 Q2's same criterion.)*

## 5. The execute path (`verbs/execute.ts`) — one pipeline, both projections

```ts
/** Run a batch of model-emitted calls. SEQUENTIAL, in array order (02 §6). NEVER throws for a
 *  per-call failure — every outcome is a ToolCallRecord (errors-as-data); throwing is reserved
 *  for infrastructure impossibilities (a corrupted registry). */
executeToolCalls(
  set: ResolvedToolSet,
  calls: readonly ToolCallInput[],
  exec: ToolExecutionContext,
): Promise<readonly ToolCallRecord[]>;
```

Per call, in order — each step's failure short-circuits to an `isError:true` record whose `result`
is `JSON.stringify({ error: <message> })`, and the batch CONTINUES to the next call:

1. **Lookup** `calls[i].name` in the set. Unknown → errors-as-data (`"unknown tool: <name>"`).
   The model hallucinated a name; it gets to read that and self-correct on the recurse — a throw
   would abort the whole turn for one bad emission. (ST returns thrown errors as data too —
   `tool-calling.js:335`, one-line cite.)
2. **Parse** `arguments` — `JSON.parse`, then `argsSchema.safeParse`. Either failure →
   errors-as-data carrying the zod issue summary (the model corrects against its own schema —
   the rpg "schema violation returns an error result the model corrects, never a repair modal"
   posture, rpg-design/05 §3).
3. **Gate** — `checkToolCapability(entry, exec, ctx.can)`: `null` capability passes;
   `scope:"global"` → `can(exec.principal, action, {kind:"global"})`; `scope:"chat"` →
   `can(exec.principal, action, {kind:"chat", roster: exec.roster})` (null roster = denial).
   `can` throws `DomainForbiddenError` on deny — execute CATCHES it and converts to
   errors-as-data (`"not permitted: <tool>"`). WHY data not throw: a denial is a policy fact the
   model should learn ("stop calling that"), not a turn-fatal event; the gate HELD either way.
   *(Rejected: rethrow — one over-ambitious call kills a whole narration turn.)*
4. **Invoke** `entry.handler(parsedArgs, exec)` inside try/catch. A throw → errors-as-data
   (message only — stack traces never reach the model). `signal` is the handler's job to honor
   (long handlers pass it down); execute does not race a timeout in v1 (no consumer needs one;
   criterion to add: the first tool that does real network I/O).
5. **Serialize** — the ONE stringify site: `ok:true` → `result = JSON.stringify(value)` (a
   handler returning a string still gets stringified — the record's `result` is ALWAYS a JSON
   document so client chips can `JSON.parse` unconditionally, 03 §4); `ok:false` →
   `JSON.stringify({ error })` + `isError:true`.
6. **Record** — assemble the `ToolCallRecord` (03 §3): `toolCallId`/`name`/`arguments` verbatim
   from the input (provenance-faithful — even when parse failed), `result`, `isError`,
   `durationMs` from the injected clock.

```ts
// contract/results.ts
export type ToolHandlerResult =
  | { readonly ok: true; readonly value: unknown }   // JSON-serializable; execute stringifies
  | { readonly ok: false; readonly error: string };  // errors-as-data at the handler's own level
```

**WHY a Result union instead of throw-for-errors:** handlers distinguish "the domain says no"
(a legality result the model narrates — `ok:false`) from genuine bugs (throw, caught at step 4);
both become data, but the union keeps the intentional path visible in every handler's types.
*(Rejected: throw-only — conflates "attack misses" with "null deref". Rejected: returning the
record directly from handlers — handlers would own ids/duration/serialization, 23 copies of it.)*

## 6. The service surface (`contract/service.ts`)

```ts
export interface ToolUseService {
  register(def: ToolDefinition): void;                       // compose-time only
  resolveTools(names: readonly string[]): ResolvedToolSet;   // per-turn read surface
  executeToolCalls(
    set: ResolvedToolSet,
    calls: readonly ToolCallInput[],
    exec: ToolExecutionContext,
  ): Promise<readonly ToolCallRecord[]>;
  toWireTools(set: ResolvedToolSet): readonly WireTool[];    // 02 §2
  toAgentToolServer(                                          // 02 §3
    set: ResolvedToolSet,
    exec: ToolExecutionContext,
    deps: { readonly createAgentToolServer: CreateAgentToolServer },
    onRecord: (record: ToolCallRecord) => void,
  ): AgentToolServer;
}
```

Chat and buddy consume this via injected ops on THEIR contexts (never a sideways import) — the
exact op subsets are specified where they're consumed: chat's in 03 §1, buddy's in 02 §3.
`ToolDefinition` stays domain-internal (`contract/params.ts`, not `@orb/contracts`) per the
committed doc §8 Q2 — resolution recorded in [`05 §1`](05-build-plan-and-resolutions.md).
