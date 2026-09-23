---
kind: adr
status: active
updated: 2026-09-23
---

# D121-E's order table gains a FIFTH leg: `PROMPT_HISTORY`, the ephemeral prompt-build pass

## Context

Not recorded in the ledger row.

## Decision

Every regex leg D121-E named runs at PERSIST time (SEND rewrites the composer draft before the row is written; RECEIVE rewrites the reply before it is committed) or at RENDER time (DISPLAY). `PROMPT_HISTORY` runs at prompt-BUILD time over the assembled history and its output reaches only the wire — stored canon, the compaction digest, an export bundle and a fork's copied rows are all byte-identical afterwards, by construction (the leg holds no `Db`; its only consumer is SHAPE; `assembly/history-regex.ts`). **Its position in the order:** after SEND (which is why the assembled history already carries the post-`USER_INPUT` text) and after the per-WI-entry leg, and it is the LAST prompt-side stage before the wire body is built — `PROMPT-HISTORY leg = per-row macro resolve (renderHistoryMacros) → PROMPT_HISTORY regex → SHAPE splice/squash/name-stamp → FIT`. It runs BEFORE the token fit, not after: stripping text before the fit is what makes "strip it from the prompt" actually buy context back (ST parity — `public/script.js:4475-4501` runs its pass over `coreChat` before `getMaxPromptTokens()`). D121-E's four invariants hold here unchanged and are pinned: macros resolve BEFORE regex on the leg, the replacement template gets its own macro pass, captured history text splices VERBATIM (a model line carrying `{{setvar}}` cannot mutate turn state on the way into the prompt), CEL never sees regex output. **Depth is this leg's and only this leg's:** `historyDepth {min, max|null}`, depth 0 = the newest message counting backwards (the ST semantic, `extensions/regex/engine.js:361-372` + `script.js:4478`), present IFF the placement set carries `PROMPT_HISTORY` — enforced in BOTH directions by a contracts check, because `placement` is a SET and no discriminated arm can express "this field exists only on this placement". D121-E's drop of the never-executed `minDepth`/`maxDepth` stands: what returned is a scope on a leg that can execute it. **The ReDoS posture:** this is the only O(rows × scripts) leg, so a catastrophic pattern would otherwise multiply the 50 ms `node:vm` watchdog by the conversation length; the cap is EVICTION — a script that fails once is dropped for the remainder of that build, bounding the leg by SCRIPT COUNT (owner-controlled) rather than history length, and every eviction is logged. **Scope delta accepted at the mint:** ST derives a ROLE scope from the placement (its `USER_INPUT` script hits user rows at prompt time); ours are persist-time legs, so `PROMPT_HISTORY` applies to ALL history rows — a role axis is a later two-member split, not a silent difference. The card lift accept-and-DROPS an imported card's flat `minDepth`/`maxDepth` rather than mapping them onto `historyDepth`, because ST scopes them on placements that mean something else here; re-scoping an imported script is one chip in the editor.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
