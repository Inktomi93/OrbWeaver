---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Settings search completes groups and plugins and says when nothing matches

## What

`menuTokens` (`packages/client/src/features/config/components/config-search-input.tsx:154-160`) completes only @shelf: values. For @in: and @plugin: it returns no completions. A no-match search renders "No settings match" (line 228); whether it is announced is unchecked.

## Why

A user typing a filter gets no guidance and a blank result reads as broken.

## Done when

@in: and @plugin: offer name completions like shelfCompletions. The no-match empty state is announced to assistive technology. A CT covers both.

## Evidence

`@in:` completes from the visible groups' names, `@plugin:` from the cached `plugin.list` slugs (`config-search-input.tsx`, `nameCompletions` in `config-search.ts`). The no-match message now renders through `CommandEmpty` with a `role="status"` message. The old guard hid it whenever any group contributed dynamic rows, which is always.

- `pnpm test:ct tests/client/features/config/surfaces/config-search-input.ct.tsx`: all 3 tests failed on the old source (no `@in:` or `@plugin:` options, no status region); all 3 pass after the change.
- `pnpm typecheck` and `pnpm lint:eslint` on the changed files are clean.
