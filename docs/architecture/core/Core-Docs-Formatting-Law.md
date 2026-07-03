---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — Docs Formatting Law (machine-first markdown)

> The `docs/architecture/` corpus is read almost exclusively by AI agents, not humans. Formatting
> therefore optimizes for the machine reader: compact bytes, short lines, deterministic style — never
> visual prettiness. **One formatter, one style, enforced by script — not by discipline.**

## The formatter

`scripts/docs/format-md.ts` (remark + remark-gfm + remark-frontmatter) is the ONE writer of markdown
style. Nothing else formats these docs — **prettier is banned from markdown** (it alignment-pads
tables; the 2026-06-30 prettier pass is what bloated the corpus by \~550KB, and
`.vscode/settings.json` now disables markdown format-on-save so an editor can't silently re-pad).

- `pnpm format:docs [files…]` — format in place (whole corpus when no args).
- `pnpm check:docs [files…]` — list unformatted files, exit 1 if any.

Scope: `docs/architecture/**/*.md` **excluding `docs/architecture/proposed/`** (in-flight drafts are
never auto-touched).

## The rules

1. **Compact tables (the load-bearing rule).** GFM pipe tables use a single space around cell
   content, `| - |` delimiter rows, and NO pipe alignment. Never pad cells so pipes line up —
   alignment padding is pure waste for an agent reader (the measured damage: `Tier-1-DB.md` was 51%
   padding by bytes). Don't hand-align tables when writing; the formatter compacts them anyway.
2. **YAML frontmatter passes through verbatim.** Every doc carries (or will carry) a
   `kind:` / `status:` / `supersedes:` / `updated:` header. The formatter parses the fence and never
   reformats its contents. Frontmatter *schema* validation is a planned extension of the same script
   (zod on the parsed yaml node) — add it there, don't grow a second tool.
3. **No prose reflow.** The formatter preserves existing line breaks and does not wrap long lines
   (markdownlint MD013 is off). Write new prose however you like — unwrapped paragraphs are fine and
   preferred (fewer artifacts when grepping; hard wraps add nothing for an agent). One-sentence-per-line
   was considered and rejected: it inflates line count for zero token benefit and would force a
   corpus-wide rewrite for style alone.
4. **Deterministic style normalization.** `-` bullets, `*emphasis*` / `**strong**`, backtick fences,
   ATX headings, `lf` line endings. Backslash escapes in output (`F32\_BLOB`, `2\*3`) are the
   formatter keeping bare `_`/`*` render-safe — they are legal and expected; don't "fix" them.
5. **Idempotent or it doesn't ship.** `format(format(x)) === format(x)` — verified across all 73
   docs at adoption. If a doc round-trips unstably, that's a formatter bug; fix the script, don't
   exempt the doc.

## Enforcement state (flip-on after the sweep)

`check:docs` is **advisory** — deliberately NOT wired into `pnpm check`/lefthook yet, because \~72
docs predate the law and would red-fail every commit while other agents are mid-edit. After the
coordinated corpus-wide `pnpm format:docs` sweep lands, make it law by appending `&& pnpm check:docs`
to the root `check` script in `package.json` — lefthook pre-commit/pre-push inherit it automatically.

## Why bytes, not just tokens

Measured on the demo (`Tier-1-DB.md`): 101,852 → 49,545 bytes (−51%), but only −609 o200k tokens
(−4.4%) — BPE tokenizers compress space runs, so token savings are real but modest (\~1.5% corpus-wide,
\~8.3k tokens). The byte/line-width win is the bigger deal for agents: padded table rows were
500–1500+ chars wide, which burns tool-output truncation budgets (30k-char Bash caps, grep line
dumps) and makes targeted `Read` offsets useless. Compact docs are cheaper to grep, diff, and excerpt.
