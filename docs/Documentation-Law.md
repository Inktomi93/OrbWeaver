---
kind: law
status: active
updated: 2026-07-03
---

# Documentation & Comments Law

> The PRIMARY reader of this repo's docs and comments is an AI coding agent, not a human. This optimizes for machine consumption, token budget, and drift-resistance. Prescriptive; enforced by the gates in §Enforcement; grounded in the 2024–2026 literature (§Evidence). Applies to code comments, prose docs, and agent-context files.

## First principles (load-bearing)

1. **A wrong doc is worse than no doc.** Stale/misleading comments and prose actively degrade agent reasoning (measured: test success collapses to ~22% under wrong comments; ~23% output-prediction drop) and correlate with bugs (~1.5× within 7 days). A *missing* doc is cheap. **Delete drift on sight; never leave a comment that lies about the code.**
2. **Code + types are the source of truth.** Prose that merely restates code gives ~zero measurable agent benefit and costs tokens. If the code or a type shows it, delete the prose.
3. **Keep the irreducible WHY in prose.** Cross-cutting decisions, boundaries, and rationale NOT visible in any single file (why a boundary exists, a ledger decision, a non-obvious invariant) DO belong in retrievable prose — a codebase-only agent fails on decisions never encoded in source. This is the only prose worth maintaining.
4. **Terse beats comprehensive.** Big generic overviews make agents over-explore (generated context files *lowered* task success and raised cost +20–23%). Write navigational and specific. No padded prose — docstrings compress 25–40% with no quality loss.
5. **One fact, one home.** Agents over-retrieve; duplication multiplies drift. A fact lives in exactly one place; everything else points to it.

## Code comments

- **WHY, not WHAT.** Comment only the non-obvious: invariants, constraints, gotchas, security belts, why-this-is-deliberate, cross-file coupling. Never narrate what the code plainly does.
- **TSDoc for exported API.** Public/exported functions, types, params, and returns use TSDoc (`/** */`) — the one cross-tool machine-parseable standard (TypeDoc, API Extractor, ESLint, VS Code parse it identically). Lean on the type system first; comment only what types cannot express.
- **Drift is a defect.** Change code → fix or delete its comment in the same change. A lying comment is a bug and is gated like one.
- **FLAG convention.**
  - `FLAG[PD-<n>]` — tracked debt/deferral; MUST have a row in the debt registry (`architecture/core/Core-Audits-and-Debt.md`), grep-reconciled by the `pd-citation-integrity` gate.
  - `FLAG[<name>]` — permanent architectural marker (documents why a design is deliberate). DO NOT "resolve" or remove these.

## Prose / knowledge docs (`docs/`)

- **Taxonomy is physical.** `core/` = current law · `history/` = resolved archeology (dated audits, cleared ledgers) · `proposed/` = unbuilt specs. A doc lives in exactly one.
- **Built code has no prose doc.** For a built module/domain, the code + its file-headers + tests ARE the doc. The cross-cutting law it carries promotes UP to `core/`; the per-module prose is deleted.
- **Structure.** One topic per file, under ~40 KB. Compact tables only — alignment-padding is pure token waste. No prose reflow. Every doc opens with the frontmatter below.
- **Frontmatter (required):**
  ```yaml
  ---
  kind: law | spec | reference | history
  status: active | draft | superseded
  supersedes: <path>   # optional
  updated: YYYY-MM-DD
  ---
  ```
- **Staleness.** A dated/resolved audit moves to `history/`. A "Status: planning" doc whose thing is built is deleted. A stale pointer ("latest decision D54" while the ledger is at D61) is drift — fix or delete.

## Agent-context files (`AGENTS.md`, `CLAUDE.md`, the AGENTS-1/2/3 set)

- Keep them **terse and navigational** — a map, not a textbook. Point to the specific home of each rule; do not restate it. The evidence is explicit that comprehensive architecture overviews *hurt* agent task success and inflate cost. Human-curated + minimal beats generated + exhaustive.

## Enforcement (what makes this law)

- `pnpm format:docs` / `check:docs` — compact tables + frontmatter (mechanics in `architecture/core/Core-Docs-Formatting-Law.md`).
- `pd-citation-integrity` — every in-code `FLAG[PD-n]` ↔ a registry row.
- Structural gates + a standing review rule: an inconsistent comment or doc is a **defect**, not a nit.

## Evidence

Young field — mostly 2024–2026 primary papers; do not over-anchor on any single one. The direction is consistent across independent sources.

- Wrong ≫ missing, asymmetric harm — Macke & Doyle (NAACL 2024 Findings); CodeCrash (NeurIPS 2025).
- Comment/code drift ↔ bugs (~1.5× / 7 days) — arXiv 2409.10781.
- Correct docs ≈ no inference-time benefit — Macke & Doyle.
- Prose 25–40% compressible, no quality loss — ShortenDoc (ACM TOSEM, 10.1145/3735636).
- Agents over-retrieve (recall ≫ precision) — ContextBench (arXiv 2602.05892).
- Context files dominant but mixed/negative effect — ETH (arXiv 2602.11988); adoption (arXiv 2602.14690).
- TSDoc is a cross-tool standard — tsdoc.org.
- Code-only fails on unencoded decisions — arXiv 2605.08112 (weakest source: vendor preprint, tiny N).
