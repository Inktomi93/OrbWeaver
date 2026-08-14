---
kind: review
status: active
updated: 2026-08-14
---

# Macro-engine DoS audit (2026-08-09)

Read-only audit. No code changed. Ranked by MULTIUSER severity (a member / imported card / SSO-provisioned
user / approval applicant supplies content the HOST's engine processes on a shared, single-threaded Node
instance). The single event loop is the shared resource — one blocking parse denies service to EVERY user.

## TL;DR — the one real hole

**The kit macro PARSER is O(n²) in input length, and it runs BEFORE the engine's DoS budget applies.** The
depth (64) and output (1 MB) caps that `dos-bounds.suite.test.ts` proves are all in the EVALUATOR. The parser
has no cap of any kind. Measured against the real engine (`packages/kit/src/macro/parser.ts`, benchmarked
this session):

| dense `{{a}}` macros | bytes | `parseMacros` time |
| - | - | - |
| 4 000 | 20 000 | 168 ms |
| 8 000 | 40 000 | 623 ms |
| 16 000 | 80 000 | 2 939 ms |
| 20 000 | 100 000 | **4 386 ms** |

Doubling the bytes \~4× the time — textbook quadratic. Root cause: `spanAt(text, offset, length)`
(`parser.ts:28-40`) recomputes line/column from index 0 on EVERY recognized macro tag
(`parser.ts:193`), unconditionally (even when no diagnostics sink is attached). K tags in an L-byte string
\= O(K·L); dense minimal macros give O(L²).

This matters because the exploitability is decided ENTIRELY by the input-size cap on each entry point:

- **10 KB-capped inputs → \~42 ms → acceptable.** Injection templates / nudges / `wiFormat` /
  `guidedActions.*.prompt` (`MAX_INJECTION_TEMPLATE_LENGTH = 10_000`), automation arm templates
  (`TRANSFORM_TEMPLATE_MAX = 8192`), imagery templates (≤ 4000). The existing 10 KB cap the brief flagged is
  in fact SUFFICIENT for these — not because 10 KB can't expand-bomb (the depth/output budget stops that),
  but because 10 KB can't quadratic-parse-bomb.
- **100 KB-capped inputs → \~4.4 s EACH → DoS.** Character card fields (`TEXT_MAX = 100_000`:
  description, personality, scenario, exampleMessages, systemPrompt, postHistoryInstructions, creatorNotes),
  each of up to 100 greetings (`GREETINGS_MAX = 100`), and world-info entry `content`
  (`CONTENT_MAX = 100_000`). These are the fields that reach `renderMacros` on every assembly (resolve-on-read),
  and these are exactly the fields an imported ST card / a shared lorebook / a member-authored persona carry.

A single maxed card description of dense macros blocks the event loop \~4.4 s; a card that maxes several fields
plus a greeting stacks into tens of seconds; the block is repeated on every swipe/regen/new-assembly. On a
shared instance this is a full-instance DoS triggered by any user who can get a crafted card, lorebook, or
persona into a chat the host (or any member) then takes a turn in.

**The fix is cheap and non-breaking: make `spanAt` incremental (carry a running line/col as the main scanner
advances) or compute the span lazily only when a diagnostic is actually emitted.** Either removes the
quadratic and leaves byte-output identical. Do NOT "fix" this by lowering the 100 KB card cap — that breaks
legitimate large cards and leaves the class alive on the next big field.

---

## Surface inventory + guard/gap table

Legend for guards: **DEPTH** = 64-level recursion cap · **OUTPUT** = 1 MB output cap · **NEUTRALIZE** =
untrusted values ZWSP-fenced before splice · **VM-TIMEOUT** = node:vm 50 ms watchdog · **INPUT-CAP** =
schema length cap at the write boundary · **—** = absent.

### A. The kit macro engine (the shared atom)

- **`packages/kit/src/macro/engine.ts` — `processMacros` / `createMacroContext` / the budget.**
  Does: entry point; parse → evaluate; threads `MacroBudget` through the three recursion seams
  (`evaluateString`, `evaluateAST`, `resolve`). Guards: DEPTH (`MAX_DEPTH = 64`, engine.ts:15,46-63),
  OUTPUT (`MAX_OUTPUT_BYTES = 1_000_000`, engine.ts:16 / evaluator.ts:203-218). Gap: **no INPUT-CAP, no
  wall-clock timeout, and the budget does not cover the PARSE phase** (parse runs at engine.ts:83 before any
  guarded seam). Recursion + expansion-bomb (billion-laughs) are well handled; parse-time exhaustion is not.
- **`packages/kit/src/macro/parser.ts` — the `{{…}}` scanner.** Does: hand-rolled depth-aware scan, degrade-
  don't-throw. Gap: **`spanAt` O(offset)-per-tag ⇒ O(L²) parse** (the headline). No other parser gap —
  `scanMacroBody` / `splitArgs` / `buildBlocks` are linear; nested re-parse at eval time is depth-guarded.
- **`packages/kit/src/macro/evaluator.ts`.** The OUTPUT cap lives here and is charged on every append
  (evaluator.ts:203-218); fail-open handler policy degrades a throwing macro to its literal (evaluator.ts:113-120)
  — correct posture, not a DoS vector.
- **`packages/kit/src/macro/user-macros.ts` — preset/game TEMPLATE macros (WAVE MU).** Does: registers author
  templates as per-render registry entries; body resolves through `ctx.resolve` (shared budget). Guards:
  DEPTH+OUTPUT (via `ctx.resolve`), NEUTRALIZE (arg/input values `neutralizeMacros`'d before splice, :214),
  name shape gated by `MACRO_NAME_RE` so the `splice` RegExp is a fixed `\{\{\s*NAME\s*\}\}` — ReDoS-safe,
  linear. No new gap. Mutual recursion trips DEPTH; the volatility fixpoint is bounded by `defs.length`.
- **`packages/kit/src/macro/content.ts` — `neutralizeMacros` / `swapIdentityMacros` / `trimContent`.** All
  single-pass linear `.replace` over fixed regexes; `swapIdentityMacros` uses a function replacement so a
  name containing `$&`/`$$` can't splice a pattern. Safe.
- **`packages/kit/src/macro/variables.ts` — `applyVarOp` / `foldVarOps`.** Pure O(ops) delta fold. Safe.

### B. Server macro call sites (feed the atom)

- **`domain/chat/assembly/macros.ts` — `renderMacros` (per-section) / `freezeVolatileMacros` /
  `renderHistoryMacros` / `buildTurnMacroContext`.** THE live-turn feed. Passes card/WI/history content into
  `processMacros`. Guard: relies entirely on the engine's DEPTH+OUTPUT + the per-field INPUT-CAP. **Gap:
  inherits the O(L²) parse on 100 KB fields — this is where the DoS lands.**
- **`domain/chat/verbs/extract-quiet.ts:100` — imagery quiet-extraction instruction.** `processMacros(p.instruction, …)`.
  `p.instruction` is the imagery template (`IMAGERY_TEMPLATE_MAX_CHARS = 4000`) — owner-authored via
  `UserSettings.imagery`. The user-macro plane reaches here (per the file's IMGMAC note). Guards: INPUT-CAP
  (4 KB) + DEPTH+OUTPUT. Single-user; safe.
- **`domain/automation/substrate/macro-render.ts:45` — arm template render.** `TRANSFORM_TEMPLATE_MAX = 8192`,
  `strictArgs` on, CEL activation. Guards: INPUT-CAP (8 KB) + DEPTH+OUTPUT. Automation rules are owner-scoped;
  8 KB parse ≈ 30 ms. Safe unless a member can author automation (confirm authz — see "needs human review").
- **`domain/rpg/substrate/reminder.ts:429` — prose-slot teach text.** Names-only registry, input is
  system/preset prose-slot text. Safe.
- **`domain/persona/substrate/macro-swap.ts` — `swapPersonaMacros`.** One `swapIdentityMacros` pass, linear. Safe.
- **`kit/guided/index.ts` — `resolveGuidedInstruction` (guided-steer + nudge + bound-preview).** `{{input}}`
  and `{{base}}` (other-author greeting) both NEUTRALIZE'd before splice (:138,:145); `{{person}}`/`{{base}}`
  are fixed `\{\{\s*person\s*\}\}` replaces — linear. Template is the preset `guidedActions.*.prompt`
  (10 KB cap). Guards: NEUTRALIZE + INPUT-CAP + DEPTH+OUTPUT. Safe.

### C. The regex-script engine

- **`packages/kit/src/regex/index.ts` — `executeRegexScripts` (isomorphic).** Runs user/card-authored
  find/replace over message content. Guards: `MAX_FIND_REGEX_LENGTH = 2048` pattern cap; a `tooComplex`
  heuristic (:156-165); per-script try/catch → `onScriptFailure`; ordering makes captured text never
  macro-evaluated. `processMacros` on `replaceString`/`trimStrings`/`pattern` inherits the engine budget.
- **`packages/server/src/kit/regex/index.ts` — the node:vm ReDoS watchdog.** VERIFIED present. Runs
  `text.replace(regex, replacer)` in a `vm.createContext` (`codeGeneration` off) with a hard
  `REGEX_APPLY_TIMEOUT_MS = 50` V8 interrupt; timeout throws → `onScriptFailure`; never silently passes
  through. VERIFIED all four server call sites inject it as `applyReplace`
  (`assembly/context.ts:216,777,858`, `history-regex.ts:83`, `engine/pipeline.ts:336,351`, `verbs/edit.ts:225`).
  **The server regex path is timeout-protected end-to-end.**
- **`packages/client/src/lib/message-render.ts:90` + `features/regex/lib/regex-preview.ts:125` — DISPLAY
  tier, browser.** Uses the DEFAULT `applyReplace` = native `text.replace` with **NO timeout** — the browser
  cannot host node:vm. Its ONLY guard is the `tooComplex` heuristic, which the source itself documents admits
  the canonical `(a+)+` (one quantifier stack; the cap is ≥ 3 stacks). VM-TIMEOUT: **—**.

### D. World-info keyword matching (adjacent, checked)

- **`packages/kit/src/world-info/index.ts` — `keyRegex` / `matchEntryKeys`.** Keys are compiled as
  `RegExp.escape(key)` inside fixed word-boundary assertions — **fully-escaped literals, no user-controlled
  quantifiers ⇒ ReDoS-SAFE by construction.** Non-global `.test`, so no `lastIndex` statefulness bug. LRU
  cache bounded (1024). Haystack bounded to recent messages + names. No DoS. (The `{{entry}}`/`wiFormat`
  CARRIER is the 10 KB injection-template path in §A/§B — safe.)

---

## Severity ranking (multiuser)

| # | Surface | DoS class | Single-user | Multiuser | Attacker-influenceable input |
| - | - | - | - | - | - |
| **1** | **Macro parser O(L²) over 100 KB card fields** (`parser.ts` via `renderMacros`) | resource exhaustion (parse-time, blocks the shared event loop) | low/accepted (your own card) | **HIGH** | **imported ST card, shared character, member-authored persona/description** |
| **2** | **Macro parser O(L²) over 100 KB world-info `content`** (`parser.ts` via assembly) | same | low/accepted | **HIGH** | **shared/imported lorebook entry** |
| **3** | **Client DISPLAY-tier regex, no timeout** (`message-render.ts`; `(a+)+` passes `tooComplex`) | ReDoS (freezes the VIEWER's tab) | low/accepted (your own tab) | **MEDIUM** | **card-embedded / shared-character DISPLAY regex script rendered in another member's browser** |
| 4 | Injection templates / nudges / guided prompts / automation arms / imagery templates (≤10 KB) | parse-time (bounded \~≤42 ms) | negligible | LOW (bounded; watch the multiply — many templates per turn) | preset/automation/imagery author |
| — | Server regex path | ReDoS | — | **mitigated** (node:vm 50 ms, injected everywhere) | — |
| — | World-info key matching | ReDoS | — | **safe** (escaped-literal patterns) | — |
| — | Recursion / expansion-bomb across ALL macro paths | billion-laughs / infinite recursion | — | **mitigated** (DEPTH 64 + OUTPUT 1 MB, budget threaded through every seam incl. lazy/block/user-macro) | — |

## Recommended guards (prioritized → fix lanes)

1. **\[P1 · kill the quadratic parse] Make `spanAt` O(1) amortized.** Carry a running `line`/`col` (and a
   `lastNewlineIndex`) in the `parseMacros` scan loop and pass it into `readTag`, OR make the span LAZY —
   store `{offset, length}` on the node and compute line/col only inside the diagnostic emitters
   (`evaluator.ts` `unknown-macro` / `macroArgDiagnostics`), which run far less often than once-per-tag. Byte
   output is unchanged; only diagnostic `span.line`/`col` derivation moves. Add a parse-time regression pin to
   `dos-bounds.suite.test.ts`: parse of a 100 KB dense-macro string completes under a small budget
   (e.g. < 100 ms). This ONE fix retires findings #1 and #2 and hardens every current and future
   `processMacros` caller at once — it is strictly better than tightening any input cap.
2. **\[P1 · defense-in-depth belt] Add an INPUT-CAP + optional wall-clock ceiling to the engine.** After #1
   the engine is linear, but a defensive `MAX_INPUT_BYTES` in `processMacros` (reject/degrade past, say, a few
   MB) closes the class permanently regardless of any caller forgetting a schema cap. This is the trust-boundary
   belt: the engine should not trust that every one of its \~10 call sites capped its input. Keep it generous
   (real prompts are tiny) so legitimate 100 KB cards pass.
3. **\[P2 · client ReDoS] Give the DISPLAY tier a real timeout OR a stronger pre-filter.** Options, cheapest
   first: (a) run DISPLAY regex in a Web Worker with a `terminate()` deadline (mirrors the server's node:vm
   posture); (b) strengthen `tooComplex` to also reject a SINGLE nested-quantifier-with-inner-quantifier shape
   (`(…+…)+`, `(…*…)*`) so `(a+)+`-class patterns are refused pre-compile in the browser. Note `tooComplex` is
   shared kit code — strengthening it also tightens the server pre-filter (belt before the vm), which is fine.
   Confirm first whether shared/imported characters can carry DISPLAY-placement regex that renders in a
   non-owner's browser (see below) — that decides whether this is MEDIUM or LOW.

## Honest floors — what I did NOT read / verify

- **Authz on WHO can author each surface was NOT audited** — I mapped the engines and their input caps, not
  the permission kernel around card/persona/WI/automation/regex-script creation and chat membership. The
  severity ratings ASSUME the shipping multiuser model lets a non-owner get a crafted card / lorebook / persona
  into a chat another user assembles, and lets a shared character's DISPLAY regex render in a co-member's
  browser. **Both assumptions need a human check against `Spine-Identity-and-Auth.md` + the membership/fork/
  handoff copy paths** — if a member genuinely cannot introduce foreign card/WI/regex content into a shared
  chat, findings #1–#3 drop toward single-user/accepted. The fork/handoff host-plane copy paths (recent
  security work) are the likeliest place attacker content crosses into a host's engine; I did not trace them.
- I did not run the full behavioral macro suite; I benchmarked `parseMacros` directly (numbers above are from
  this box, Node v26.5.0) and read the engine/evaluator/parser/user-macros/content/regex sources in full.
- I did not exhaustively enumerate every `processMacros`/`executeRegexScripts` caller's per-field cap beyond
  the ones tabled; refinery `REWRITE_TEXT_MAX = 100_000` exists but I did not confirm whether refinery text is
  macro-processed (if it is, it is a fourth 100 KB quadratic surface — the P1 parser fix covers it regardless).
- The token-guard/recognizer `lastIndex` class (\[\[token-guard-borrows-the-renderers-recognizer]]) is a
  correctness/refusal concern, not a DoS vector, and was out of scope here. </content>

</invoke>
