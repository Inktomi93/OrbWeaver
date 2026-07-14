---
kind: spec
status: active
updated: 2026-07-03
---

# 02 — Expressions: CEL, `{{expr::…}}`, Macro-DX, and Global Variables

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.** The
> expression layer both tiers share: CEL predicates (adopted, D46), the macro-DX parity layer, and
> the per-user global-variable plane. `kit/macro` stays the interpolation + mutation engine; CEL is
> the safe expression evaluator — one variable namespace, two composed roles.

---

## 1. The CEL binding surface (exactly what a predicate can see)

**DECISION: predicates evaluate against a fixed, documented activation object — nothing ambient.**
Built per dispatch by `substrate/cel-env.ts`, from the same sources the macro `MacroEnv` is built
from (one namespace, per D46):

```ts
/** The CEL activation for a rule predicate (and for {{expr::…}} — §3). All values are JSON-safe
 *  scalars/lists/maps; no functions beyond CEL's builtins; no handles. */
export interface AutomationCelEnv {
  /** The resolved TriggerFact (01 §2). Predicate-only — absent under {{expr::…}} (no event there). */
  readonly event?: TriggerFact;
  /** The chat's CURRENT runtime variables — the materialized delta-fold cache, read-only.
   *  String values (the persistence boundary type). `vars["mood"] == "grim"`. */
  readonly vars: Record<string, string>;
  /** ChoiceBlock config-plane picks, MERGED view (picks ∪ preset defaults — neo's merged read). */
  readonly choice: Record<string, string>;
  /** The RULE AUTHOR's per-user global variables (§4). Rules run as their author (03 §2), so
   *  `global` is the author's namespace — never the triggering member's (no cross-user reads). */
  readonly global: Record<string, string>;
  /** Narrow chat projections. Deliberately tiny; a predicate needing more is a Tier-2 job. */
  readonly chat: { readonly id: string; readonly messageCount: number };
  /** The injected clock, sampled ONCE per dispatch batch (all rules matching one event see the
   *  same instant — determinism + no intra-batch time skew). Epoch ms + convenience fields. */
  readonly now: { readonly epochMs: number; readonly hour: number; readonly dayOfWeek: number };
}
```

**No PRNG in predicates.** WHY: a predicate must be a deterministic function of (event, state) so
`testRule` (04 §2) replays are exact and the golden suite is stable; randomness belongs in ACTION
templates (`{{roll}}`/`{{random}}`, which draw from the injected PRNG). *(Rejected: a `rand()` CEL
extension — "fire 20% of the time" is expressible as a `{{roll}}`-seeded variable if truly wanted,
and non-replayable predicates poison the test-run surface.)*

**Evaluation budget + determinism:**

- Expression source length ≤ **2 KiB**, parsed + type-sanity-checked at `createRule`/`updateRule`
  time (a rule with an unparseable predicate is never stored). cel-js is linear-time and
  mutation-free by construction — the parse-time cap IS the budget; no runtime watchdog needed.
  *(Rejected: a per-eval `node:vm` timeout à la `kit/regex` — regex needs it because backtracking
  is superlinear; CEL is not, and a watchdog would be dead weight.)*
- The evaluator is wrapped in `kit` (`@orb/kit/cel` — a thin seam over `@marcbachmann/cel-js`:
  `parseCel(src) → CelProgram | CelParseError`, `evalCel(program, env) → CelValue`). WHY a kit
  seam: isomorphic (client-side rule-editor validation reuses it), and the dependency is pinned in
  ONE home if the package is ever swapped.
- **Failure posture: a predicate RUNTIME error (missing field without `has()`, type mismatch) means
  the rule is SKIPPED for that event** — logged, `consecutive_errors` incremented on the row,
  `ruleErrored` emitted on the automation bus (04 §5), and the turn/event flow is NEVER affected
  (the D53 posture). After **20 consecutive errors** the rule auto-disables and the host is
  notified (`post_notification` machinery, self-consumed). LEAN on the threshold — resolves when
  real error-rate data exists. *(Rejected: surfacing predicate errors as turn warnings — the turn
  didn't fail, the rule did; rejected: skip-forever-silently — a rule that silently rots is the
  ST-extension failure mode.)*
- A predicate must evaluate to a **boolean**; any other result type = a runtime error (skip +
  count). `predicate_cel = NULL` means "always fire" (trigger + budgets still gate).

## 2. Where CEL runs from (two call sites, one engine)

| Call site | Env | Notes |
|---|---|---|
| rule predicate (dispatch engine, 04 §3) | full `AutomationCelEnv` incl. `event` | the primary consumer |
| `{{expr::…}}` macro (§3) | env WITHOUT `event` | assembly/templates have no trigger |

Tier-2 plugins get NO direct CEL seam — a plugin is imperative JS and needs no expression DSL; it
reads `vars`/`global` through host functions (plugin-design/01).

## 3. The `{{expr::…}}` macro (CEL surfaced inside templates)

Registered in the `kit/macro` registry (metadata per §5):

- **Syntax:** `{{expr::<cel-source>}}`. The body is raw CEL over the §1 env (minus `event`).
- **Result coercion:** string ← CEL string/number/bool (`true`/`false`); a list/map result renders
  as JSON. WHY JSON for structures: the variable plane is strings-with-JSON-in-a-string (D46) — the
  macro's output must round-trip into `{{setvar}}`.
- **Errors:** parse or eval error → renders `""` + a `MacroDiagnostic` (§5) with the span of the
  macro call — the template renders, the diagnostic surfaces in the trace/editor. Macros never
  throw into assembly (the render-once pipeline can't take a per-macro abort).
- **Nesting/order:** the macro engine resolves inner macros FIRST (normal evaluation order), so
  `{{expr::{{getvar::hp}} > "10"}}` sees the resolved value. Note the type trap — `getvar` yields a
  string; the docs + the arg-validation layer steer authors to `vars.hp` inside the CEL body
  instead (the env read is typed once, not re-stringified).
- Budget: the 2 KiB source cap applies; the macro engine's existing depth + output DoS budget
  already bounds the surrounding template.

## 4. Per-user global variables (the `fetchOwned` KV plane — committed, D46)

**DDL (`@orb/db/schema/automation.ts` — the automation slice owns it; chat reads through a verb):**

```sql
CREATE TABLE global_variables (
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,                -- ≤ 128 chars, CHECK(length(key) <= 128)
  value      TEXT NOT NULL,                -- string plane; JSON-in-a-string for structure; ≤ 64 KiB CHECK
  updated_at INTEGER NOT NULL,             -- injected clock
  PRIMARY KEY (owner_id, key)
);
```

No TypeID/surrogate id. WHY: nothing FKs a global variable; the natural key IS the identity, and a
surrogate would add a brand + an index for zero referential use. *(Rejected: a `global_variable`
TypeID row — the D37 born-whole instinct doesn't apply to a table no one references.)*

**Verbs (`domain/automation/verbs/` — automation owns the plane; it is the first consumer and the
only writer-by-rule; the macro/CEL read paths receive injected ops):**

```ts
getGlobalVariable(ctx, { key }): Promise<string | null>            // fetchOwned — ownerId in WHERE
setGlobalVariable(ctx, { key, value }): Promise<void>              // upsert; validates caps
deleteGlobalVariable(ctx, { key }): Promise<void>
listGlobalVariables(ctx, { prefix? }): Promise<GlobalVariableView[]>  // the settings-page surface
```

All row-scoped by `fetchOwned` (`ownerId` = the caller's `Principal.userId`) — a user can never
read another user's globals; there is no admin bypass surface (an owner debugging a user's
automation asks the user, not the DB — the D18 single-owned posture).

**Macros:** `{{getglobalvar::key}}` (read; missing key → `""`) and `{{setglobalvar::key::value}}`
(write; renders `""`). **Semantics decision: `setglobalvar` writes are collected during the env
flush and applied at turn commit, LAST-WRITE-WINS, and are NOT variant-scoped** — a swipe does NOT
rewind a global. WHY: globals are single-owned cross-chat state with "NO chat/variant/fork
semantics" by D46 law (they are not message-derived); folding them into the per-variant delta model
would make one chat's swipe history the truth source for cross-chat state — a scope inversion.
Documented as a sharp edge in the macro metadata description. *(Rejected: immediate write mid-render
— assembly may render a template speculatively (preview/test-run); writes must ride the same
commit-or-discard boundary the chat-var delta flush does, even though the STORAGE model differs.)*

**CEL:** the `global` map in §1's env (read-only — CEL is mutation-free by design).

## 5. Macro-DX: registry metadata, validation, diagnostics, autocomplete (committed, D46)

Additive to `@orb/kit/macro` (no chat dependency — lands independently of Phase 5).

```ts
export const MACRO_CATEGORIES = [
  "identity",     // char/user/group…
  "card",         // description/personality/…
  "conversation", // input/lastMessage/…
  "variables",    // getvar/setvar/getglobalvar/…
  "time",         // date/time/isodate/…
  "random",       // roll/random/pick…
  "expression",   // expr
  "system",       // memory/compact_summary/guided_instruction/original…
] as const;
export type MacroCategory = (typeof MACRO_CATEGORIES)[number];

export interface MacroArgDef {
  readonly name: string;
  readonly type: "string" | "number" | "boolean";
  readonly optional: boolean;
  readonly default?: string;
  readonly description?: string;
}

export interface MacroMetadata {
  readonly name: string;
  readonly description: string;         // one sentence; the autocomplete/browser copy
  readonly category: MacroCategory;
  readonly args: readonly MacroArgDef[];
  readonly returnType: "string";        // macros always render string; field exists for browser display of intent
  readonly aliases: readonly string[];  // e.g. ["description", "charDescription"]
  /** Renders a different value across calls/turns (time/random/conversation) — the assembly
   *  cache-buster trace (AssembleTrace.staticCacheBusters) reads this instead of a hardcoded list. */
  readonly volatile: boolean;
}
```

`MacroRegisterOptions` gains `metadata: MacroMetadata` (REQUIRED for new registrations; the
existing builtin set is backfilled in the same chunk — no metadata-less macro survives, so the
browser is complete from birth).

**Validation semantics:** at evaluation, args are checked against `args` (arity + type-coercion
check). Two modes on `MacroContext`: `strictArgs: true` → a violation renders `""` + an `error`
diagnostic; `false` (default — ST-imported content is sloppy) → best-effort render + a `warning`
diagnostic. WHY default-lenient: imported cards/presets carry years of tolerated ST sloppiness;
hard-failing them on import day is a migration tax D46 never asked for. The rule/template EDITORS
pass `strictArgs: true` (new authorship is held to the bar).

**Diagnostics with spans:** the parser carries offsets (today it has none — this chunk adds them):

```ts
export interface MacroSpan { readonly offset: number; readonly line: number; readonly col: number; readonly length: number; }
export interface MacroDiagnostic {
  readonly severity: "error" | "warning";
  readonly code: "unknown-macro" | "bad-arity" | "bad-arg-type" | "unclosed-block" | "budget-exceeded" | "expr-error";
  readonly message: string;
  readonly span: MacroSpan;
}
```

`processMacros` result gains `diagnostics: readonly MacroDiagnostic[]` (additive; existing callers
ignore it). Assembly threads them into `AssembleTrace` (host/admin debug surface); editors render
them inline.

**Autocomplete / browser query API:** pure kit function + one thin transport read:

```ts
// @orb/kit/macro — pure, isomorphic (the client bundles the same registry for editor autocomplete)
export function queryMacros(
  registry: MacroRegistry,
  q: { prefix?: string; category?: MacroCategory },
): readonly MacroMetadata[];   // name-or-alias prefix match, category filter, stable name-sorted
```

Server-registered context macros (memory/guided/system) aren't in the client bundle's registry —
the Phase-6 editor merges `queryMacros(clientRegistry, q)` with a `macro.list` tRPC read that runs
the same function over the server registry. One function, two registries, merged by name.
*(Rejected: a server-only API — editor autocomplete must work offline-fast on every keystroke;
rejected: client-only — it would lie about server-side macros.)*
