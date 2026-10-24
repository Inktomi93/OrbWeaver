---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: tooling
---

# Biome --write turns bidi escapes into literal invisible characters

## What

A scoped `biome check --write` in the 1278 lane rewrote `\u202E`/`\u202C` escapes in a test string into the literal invisible bidi characters; the lane rebuilt those strings from code points. Other files may already carry literal bidi or control code points from earlier --write runs.

## Why

Literal bidi controls in reviewed source are the trojan-source hazard: the code a reviewer reads is not the code that runs.

## Done when

The Biome rule or formatter option that unescapes them is identified and configured to keep control and bidi code points escaped, or a gate rejects literal bidi and C0/C1 control code points in tracked source; a sweep of the tree reports none (or each is fixed); a planted literal fails the gate.

## Evidence

- Cause: Biome does not unescape. On Biome 2.6.2, `biome format --write`, `biome check --write` and `biome check --write --unsafe` all kept `\u202E`, `\u202C`, `\u2066`, `\u0007`, `\u0085`, `\x07` and `\u{202E}` escapes byte for byte (`cat -A` after each run). The probe file was built from code points by a script. `noUnusedTemplateLiteral` and quote normalization rewrite only the delimiters. The literal characters come from the agent's own Write and Edit output. Two Write calls and one Edit call stored U+202E, U+202C, U+2066 and U+00A0 on disk where the agent wrote escape text, before any Biome run. The same calls kept the C0/C1 escapes, and another Edit call kept every escape, so the decode is intermittent. Biome has no option to configure, and its `noIrregularWhitespace` covers CSS only.
- Gate: core ESLint rules in `eslint.config.ts`. `no-restricted-syntax` rejects literal bidi controls and C0/C1 controls (U+0000-0008, U+000B-000C, U+000E-001F, U+007F-009F, U+061C, U+200E-200F, U+202A-202E, U+2066-2069) in `Literal`, `TemplateElement` and `JSXText` raw text. `no-warning-comments` rejects them in comments. The gate covers every JS and TS file ESLint lints, through `pnpm lint:eslint` and the pre-push hook. Flat config replaces rule options per block, so each `no-restricted-syntax` block spreads `INVISIBLE_CONTROL_SYNTAX`.
- Sweep: 7960 tracked files, 7682 text files scanned, 276 binary files skipped, 2 directory entries skipped, 0 non-UTF-8 files. Two lines in `packages/server/src/domain/chat/memory/generate/substrate/transcript.ts` held a raw U+0001 hash separator. They now read `"\u0001"`, so the runtime bytes are the same. The vendored `tooling/src/snap/lib/devtools-frontend/**` CodeMirror bundle holds intentional bidi and control data and stays outside Biome and ESLint. `git ls-files -z | xargs -0 grep -lIP` over both classes matched the same files.
- Plant: a TS file with literal U+202E, U+2066/U+2069, U+0007, U+0085 in a regex, U+202E and U+061C in comments, and U+200F in a literal type. It passed under the old config (exit 0) and failed under the new config with 7 errors (exit 1). It failed again in server, test, CT (JSX text) and `.mjs` paths. A tab and an escaped `\u202E` on the same plant stayed clean. With the spread removed from the server block in a scratch config, the server plant's string and literal hits disappeared. The plants were then removed.
- Not covered: non-JS text (Markdown, JSON, CSS, YAML) has no native rule in Biome or ESLint. The sweep found none, but an agent edit to this item's Markdown stored literal U+202E, U+202C and U+2066 that no gate caught; a script re-escaped them.
