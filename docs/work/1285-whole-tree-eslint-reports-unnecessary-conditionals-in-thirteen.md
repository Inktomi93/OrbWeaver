---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: tooling
---

# Whole-tree ESLint reports unnecessary conditionals in thirteen files

## What

`pnpm lint:eslint packages tooling tests` on main exits 1 with sixteen `@typescript-eslint/no-unnecessary-condition` errors (and one `no-unnecessary-type-conversion`) across thirteen files: five client features (`character/components/character-library-welcome.tsx`, `discovery/components/corpus-understanding-invitation.tsx`, `plugin/lib/plugin-command-dispatch.ts`, `preset/components/params-deck.tsx`, `preset/hooks/use-preset-list-header.tsx`), five server files (`domain/chat/substrate/wire-history.ts`, `domain/import/verbs/import-presets.ts`, `domain/import/verbs/import-themes.ts`, `domain/settings/verbs/import-theme-file.ts`, `entry/http/import-chat.ts`, `transport/trpc/routers/world-info.ts`) and two tooling files (`snap/ops/appearance-invariants.ts`, `snap/ops/run-report-render.ts`). Most are `??` on a value the types say is never null; two are comparisons whose types do not overlap. Scoped runs on changed files stayed green all day because none of these files changed; the pre-push hook runs the whole tree and will refuse the push.

## Why

The pre-push check runs whole-tree ESLint; a red there blocks the owner's push, and an unnecessary conditional usually marks a type that no longer matches the value it guards.

## Done when

Each finding is resolved by fixing the type or removing the dead branch, never by a suppression; `pnpm lint:eslint packages tooling tests` exits 0 on main; the two no-overlap comparisons are read for a real bug before the branch goes.

## Evidence

Each finding was a `??` or comparison the type already ruled out, so the dead branch went; no type needed widening. The two no-overlap comparisons held no bug: `generatedReplyImagePart` tested `image.base64 !== undefined` where `GeneratedImage` guarantees it once `url` is absent, and `hasChatted` tested `lastChatId !== null` where `CharacterSummary` pairs it with `lastChattedAt`. `pnpm lint:eslint packages tooling tests` exit 0, `biome check . --error-on-warnings` exit 0, `pnpm typecheck` exit 0, and the covering suites pass (`portability-import.suite`, `import-bundle`, `import-response-boundaries`, `prompt-cache-prefix.suite`, `chat-import`, `appearance-invariants`).
