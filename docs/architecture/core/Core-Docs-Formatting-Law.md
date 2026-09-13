---
kind: law
status: active
updated: 2026-07-13
---

# Orbweaver — Docs Formatting Law (machine-first markdown)

> Formatting MECHANICS for the `docs/architecture/` corpus — the deterministic style one script emits and
> gates. CONTENT law (what a doc may say, construct verdicts, frontmatter schema) is `Documentation-Law.md`;
> this doc owns only the byte-level style. The corpus is read almost exclusively by AI agents, so style
> optimizes for the machine reader: compact bytes, short lines, deterministic output — never visual
> prettiness. **One formatter, one style, enforced by gate — not by discipline.**

## The formatter

`tooling/src/doc-catalog/ops/format.ts` (remark + remark-gfm + remark-frontmatter) is the ONE writer of markdown
style. Nothing else formats these docs — **prettier is banned from markdown** (it alignment-pads tables;
`.vscode/settings.json` disables markdown format-on-save so an editor can't silently re-pad). The bloat
that got it banned: `history/misc-core-archaeology-record.md`.

- `pnpm format:docs [files…]` — format in place (whole corpus when no args).
- `pnpm check:docs [files…]` — list unformatted files, exit 1 if any.

Scope: `docs/architecture/**/*.md` **excluding `docs/architecture/proposed/`** (in-flight drafts are
never auto-touched).

## The rules

1. **Compact tables (the load-bearing rule).** GFM pipe tables use a single space around cell
   content, `| - |` delimiter rows, and NO pipe alignment. Never pad cells so pipes line up —
   alignment padding is pure waste for an agent reader. Don't hand-align tables when writing; the
   formatter compacts them anyway.
2. **YAML frontmatter passes through verbatim.** Authored docs carry the minimal
   `kind:` / `status:` / `supersedes:` / `updated:` header; vendor mirrors retain upstream metadata
   (schema owned by `Documentation-Law.md`). The formatter parses the fence and never reformats its
   contents. `tooling/src/doc-catalog/lib/receipt-rules.ts` owns flat-schema validation and the migration ratchet; the
   formatter owns bytes only.
3. **No prose reflow.** The formatter preserves existing line breaks and does not wrap long lines
   (markdownlint MD013 is off). Write new prose however you like — unwrapped paragraphs are fine and
   preferred (fewer artifacts when grepping; hard wraps add nothing for an agent). One-sentence-per-line
   was considered and rejected: it inflates line count for zero token benefit and would force a
   corpus-wide rewrite for style alone.
4. **Deterministic style normalization.** `-` bullets, `*emphasis*` / `**strong**`, backtick fences,
   ATX headings, `lf` line endings. Backslash escapes in output (`F32\_BLOB`, `2\*3`) are the
   formatter keeping bare `_`/`*` render-safe — they are legal and expected; don't "fix" them.
5. **Idempotent or it doesn't ship.** `format(format(x)) === format(x)`. If a doc round-trips
   unstably, that's a formatter bug; fix the script, don't exempt the doc.

## Enforcement

Live gate: `docs:format` in the verify registry (`tooling/src/verify/lib/registry.ts`) runs `check:docs` at the
`changed` + static tiers, so `pnpm check` (and lefthook, which inherits it) FAILS on an unformatted doc.
Scope: `docs/architecture/**/*.md` excluding `proposed/`. (History — it shipped advisory before the
corpus-wide sweep landed: `history/misc-core-archaeology-record.md`.)

## Why bytes, not just tokens

BPE tokenizers compress space runs, so compacting alignment padding saves only ~1.5% of corpus tokens —
but the byte/line-width win is the real payoff: padded table rows ran 500–1500+ chars wide, burning
tool-output truncation budgets (30k-char Bash caps, grep line dumps) and making targeted `Read` offsets
useless. Compact docs are cheaper to grep, diff, and excerpt. Measured demo:
`history/misc-core-archaeology-record.md`.
