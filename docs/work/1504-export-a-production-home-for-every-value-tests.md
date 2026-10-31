---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Export a production home for every value tests restate

## What

The derivation audit found tests copying module-private production values because no export exists: an RPG_OP_CODES object (rpg verbs throw inline codes, packages/server/src/domain/rpg/verbs/game/update-config.ts), the import and export route constants (packages/server/src/entry/http/import.ts BUNDLE_ROUTE, export.ts LIBRARY_ROUTE), PORTABLE_PARSE_FAILURES as a runtime tuple (packages/contracts/src/portability/index.ts), the Anthropic beta header names, the reaction note builder (packages/server/src/domain/chat/teaching-contribution.ts), the Shared keywords lead (packages/server/src/domain/discovery/themes/generate.ts), the durable-local storage prefix and boot-hint key, the app-ready attribute, the GPU launch switch (tooling/src/floor/browser/browser-acceleration.ts) and the ORB_ENV\_\* keys. Each moves to a zero-import module production itself imports.

## Why

A test can only derive a value production exports; the lint rules in this plan need these homes first.

## Done when

Each listed value has one production home that production reads; the tests that copied it import it; no production export exists only for tests.

## Evidence

Homes landed, each read by production:

- `RPG_OP_CODES`: packages/server/src/domain/rpg/contract/op-codes.ts, zero imports. Every inline `rpg_*` code in the rpg verbs and `contract/errors.ts` reads it. The rpg verb suites, the rpg flight corpus case and the authority suite import it.
- Portability routes: packages/contracts/src/portability/routes.ts (`PORTABILITY_ROUTES`, `exportCharacterPath`, `exportChatPath`), re-exported by `@orb/contracts/portability`. The server registrars, the lifecycle door citations and the client import, export and restore callers read it.
- `PORTABLE_PARSE_FAILURES` is exported from packages/contracts/src/portability/index.ts; the exported `PortableParseFailure` type derives from it.
- Reaction note: packages/server/src/domain/chat/reaction-note.ts (`reactionNote`, `REACTION_ANONYMOUS_REACTOR`, `REACTION_WHOLE_MESSAGE_TARGET`), read by the chat teaching contribution; the turn-teaching suite imports it.
- Shared keywords lead: packages/server/src/domain/discovery/themes/name-prompt.ts, read by the theme-naming pass; both corpus-knowledge files import it.
- Client: packages/client/src/state/durable-local-keys.ts (storage prefix, active-user key, appearance boot hint name and version) and packages/client/src/lib/app-ready-attribute.ts (`APP_READY_ATTR`, also on the `#lib` door). The durable-local doors, the boot hint, the readiness signal and the boot veil read them.
- GPU launch switch: `GPU_LAUNCH_SWITCH` in tooling/src/floor/browser/browser-acceleration.ts, read by `browserArgsWithAcceleration`.
- `ORB_ENV_NO_FILE` and `ORB_ENV_NO_OVERRIDE`: `ENV_NO_FILE_KEY` and `ENV_NO_OVERRIDE_KEY` in packages/kit/src/env-file/index.ts beside `ENV_FROM_FILE_KEY`. The server env loader, the stack plans, the stage plan and the test process env read them; the duplicate tooling `ENV_NO_FILE` is gone.

Refused: the Anthropic beta header names. Production never spells them: the SDK adds the `anthropic-beta` header from `block_binding` and `clear_at` (packages/inference/src/backends/anthropic-messages/chat.ts). The dated names appear only in curated evidence cites, so an export would exist only for tests.

Deferred to the rule sweeps (1494 and 1496 are rewriting these files): the remaining test copies of the routes, the storage keys, the app-ready attribute, the GPU switch, the env keys, `PORTABLE_PARSE_FAILURES` members and the remaining rpg and chat codes. Items 1509 and 1497 report each one.

Floor: `pnpm lint:eslint packages tooling tests` exit 0; `pnpm typecheck tooling/tsconfig.json tsconfig.node.json tsconfig.tests-dom.json` exit 0; whole-tree `pnpm depcruise` no violations; `pnpm knip:prod` exit 0; `pnpm test` over the rpg, turn-teaching, corpus-knowledge, corpus-rpg-flight, entry/http, entry/compose and foundation/env suites, 47 files and 237 tests passed; `pnpm test:tools` over stack, floor/process, browser-acceleration and snap/lib, 62 files and 500 tests passed.
