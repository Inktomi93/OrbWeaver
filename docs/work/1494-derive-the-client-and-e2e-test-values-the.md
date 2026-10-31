---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Derive the client and e2e test values the derivation audit found copied

## What

The read-in-full audit of the newest test files (reports/test-derivation-audit/shard-a.md, the client and e2e rows and the X1-X5 duplicate table) found copied production values, tables and logic in tests/client and tests/e2e. P2: the durable-local prefix, boot-hint key and app-ready attribute hand-copied in corpus-shell.spec.ts (E1); the appearance responder in \_surface-harness.ts spreading a capture (C1); the drill walk's hand-listed menu labels in surface-chat.ts (E4); the GPU flag and vacuous assertions in browser-launch.spec.ts (E18). P3: Show details labels, SAVE_FAILED_MARKER, MEDIA_QUERIES conditions, the font-scale channel lookup, the walker copies, the blob route and census titles.

Scope is the whole file, not only the audit rows. Rewrite each test file the newest additions touched onto the testkit: every helper a file defines locally moves to its testkit home under `tests/support/` in the right world (`iso`, `node`, `browser`) and is published through the door its callers need, with duplicates merged to one; every value, roster, table and shape derives from production; every seed runs a production verb, a root seed or a corpus builder; every case mounts the real door. A file whose cases already meet this is left alone.

## Why

Spine-Testing section 9: a test-side copy of production is a defect, and each P2 lets a product change pass the test.

## Done when

No test file in scope defines a helper that belongs in the testkit or another file already defines. Every client and e2e row in the shard-a report is fixed by an import, a door, a reach entry with its reason, a production builder or a zero-import .ts home, or ruled with a cited reason in this item's Evidence; each P2 fix fails against a planted rename or defect.

## Evidence

Partial: the P2 rows and the listed P3 rows are done; the widened sweep is not finished (see Remaining).

### Done

- E1: the homes are item 1504's `state/durable-local-keys.ts` (prefix, active-user key, boot-hint name and version, plus the scoped-key builder `durableLocalStorageKey` that `durable-local.ts` now calls) and `lib/app-ready-attribute.ts`. `corpus-shell.spec.ts` imports them, types the hint as `AppearanceBootHintState`, and ships the key builder's own source into the page. The e2e readiness helpers (`chat-room.ts`, `browser-actors.ts`, `smoke.spec.ts`, `app-readiness.spec.ts`) import the attribute too.
- C1: `_surface-harness.ts` writes appearance through `caller.settings.updateUserSettingsSection` and serves `settings.getUserSettings` through `serveCorpusProcedures`.
- E4: `safeMenuDrills` enumerates the live enabled menu items and drills the ones whose name is in `SAFE_DRILL_NAMES`, built from production name constants (`row-menu-names.ts`, `chat-options-names.ts`, `composer-menu-names.ts`, `message-action-names.ts`).
- E18: `browser-launch.spec.ts` derives the arguments from `browserArgsWithAcceleration`, fails on an empty command line and on an unnamed renderer.
- P3: `contextToggleLabel` (moved to `lib/`, on the lib door), the autosave status words (`forms/editor/autosave-status-names.ts`), `MEDIA_QUERIES` and `TOKENS` in the pinned-band suite, `channelName` in the four font-scale suites, `censusTitle`, the portrait route from `BLOB_ROUTE` and `variantKindSchema`, the showcase slugs by `satisfies`, the library page-size bounds, `SHELL_SWAP_DEADLINE_PROPERTY`, `TOKENS` tone roles, the facet inspector `Record`, `hasDevBridge` and `LOGIN_FAILED`.
- Duplicates merged: `tests/support/browser/disclosure-walk.ts` (disclosure, details walkers and `usesProgrammaticScroll`) serves the chat and section walks; `root-property.ts` (`setRootProperty`, `enlargeUntilVisible`) and `box-of.ts` serve the overflow suites; `openReadingStyle` and `roomStoryProps` in `chat-style-reading.fixtures.ts` serve the five reading-room suites.
- Codemods: `tooling/src/codemods/literal-to-binding` (literal or ast-grep pattern to a production binding, with import) applied the label, status-word and `channelName` rewrites; `rewrite-import-specifiers` and `move-import-names` moved the `contextToggleLabel` imports.

### Planted proofs

Each ran with `pnpm e2e:corpus` (project `corpus-desktop-bubble`) or `pnpm test:ct`, new case against a copy of the old one.

- E1: a production plant renamed the ready attribute and stamped it before React mounts. The new `corpus-shell` case failed at `expect(before.has(APP_READY_ATTR)).toBe(false)`; the old copy passed.
- E18: a spec copy forced an empty command line, another forced the renderer to `unknown`. The new case failed both; the old case passed both.
- C1: a plant dropped the patch in `update-user-settings-section.ts`. The new `type-ramp-census` case failed (expected 18.4, received 16); the old harness copy passed.
- E4: not proven at run time. The surface walks need an owner snapshot (`scripts/surface-walk.ts`) and were not run.

### Floor

`pnpm typecheck tsconfig.tests-dom.json packages/client/tsconfig.json tsconfig.node.json` exit 0; `pnpm depcruise` clean; `pnpm knip:prod` exit 0; `pnpm lint:eslint` on the changed paths exit 0; e2e `corpus-shell`, `browser-launch`, `corpus-editor-draft-recovery` and `smoke` on `corpus-desktop-bubble` and `corpus-phone-bubble` green. `E2E_PORT_OFFSET=90` is refused by `e2eRunPorts` in this tree (it lands on reserved ports); the runs used 250.

### Rulings

- Mount id: `main.tsx` keeps the literal `"root"`; its DOM home in `eslint.config.ts` is keyed on that literal selector, so production cannot import a constant. The spec keeps `ROOT_ID`.
- Status text: the autosave readout has its own words file; `SAVE_FAILED_MARKER` names the settings nav marker, a different surface.
- E14: the relay-tell header is the standard `Forwarded` header, which `lifecycle.ts` refuses without naming; the session read parses a single-call envelope, and `batchResultData` reads batch arrays only.
- E15: `modes.ts` is the one reader of `E2E_PORT_OFFSET`; `ports.ts` names it as the config boundary.
- E24: the `pairedControl` table runs inside `page.evaluate` and pairs native inputs with WAI-ARIA roles; no production map exists.
- C15: the container-unit pattern classifies token values by their CSS unit; no production predicate exists (`text/variants.ts` `artScale` names tokens, not units).
- E9: slugs are pinned by `satisfies` against `SHOWCASE_PLUGIN_SLUGS`; the polished-draft text is produced inside the plugin guest and has no importable function.
- Walkers: `surface-config.ts` keeps its own disclosure walk. It differs in kind (button identity, visit records), not only in plumbing.

### Second pass

- Helpers built for 1505 and used at every copy: `SHELL_MOUNT_PROCEDURES`, `routeAuthConfig`, `abortProcedure`, `channelName` on the `ct` door, the iso fallback scopes, `E2E_PORT_OFFSET_ENV`, `setRootFontScale`. Their cases and doors are listed in item 1505's Evidence.
- E12: the five e2e fault closures and their hand-written tRPC patterns use `abortProcedure`.
- E13: the two `commandMenu` helpers drive different menus; they are renamed `chatRowMenu` and `characterCommandMenu`.
- E21: `HOME_SECTION_LABEL` and `REFINERY_SECTION_LABEL` are zero-import leaves that the section definitions read.
- C21: four suites read `SHELL_MOUNT_PROCEDURES`. C20: the auth-config route copies use `routeAuthConfig`, and the planted scale is derived. C23: the fallback scopes have a testkit home. C5: the font-scale lookups and injectors use `channelName` and `setRootFontScale`.

### Rulings

- E10: `usesProgrammaticScroll` is shared; `nativeWheel` records wheel delivery facts and the chat `scrollViewport` does not, so their bodies differ by purpose.
- E11 and the checkpoint, record and expectSubject helpers: the disclosure and details walkers are one module. The journey bookkeeping differs in shape between the chat, section, character and config walkers (entries named `coverage` against `observations`, `name` against `id`, `detail` against `reason`). Item 1511 splits the walker engine and owns the shared ledger.
- E16: the surface-walk project name is composed inside `playwright-surface.config.ts` (`desktop-${width}-${name}-${pass}`); a spec cannot import the config without running it.
- E17: `JOURNEY_OWNER` is `satisfies Record<SectionId, string>`, so a section with no owner fails `tsc`.
- C4 (list panel): the "Show list panel" and "Hide list panel" names are assembled inside the `@orb/ui` panel-edge primitive from a noun; the product home is in `packages/ui`, which item 1495 owns.
- C20 (live reads): `_surface-harness.ts` and `platform-admin-reset-names.suite.ct.tsx` re-read the root's config per request on purpose and keep their own route.
- `session-freshness.ct.tsx` aborts inside a stateful `/api/auth/me` responder, not a procedure refusal, so it keeps its closure.

### Remaining

Not started: E6 and E8 (the UI sentences and action names need a production constant each, across about eight components), E22, C2, C3, C6 to C8, C14, C17, C18, C22, C24 and C28, and the shared walker ledger (item 1511). The seed-and-scope table waits on 1495.
