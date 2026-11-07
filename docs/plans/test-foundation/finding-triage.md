---
kind: plan
status: active
---

# Test audit findings by root cause

This triage sorts every test-audit finding by the code that must change. Fixes land once, in the kit or in production, and each group makes its defect impossible where a type or a native rule can.

All evidence is `path:line` on this branch. The audit's own text is a lead only. Counts below are the triage's scope evidence and go stale with the tree.

## Verdicts

| Verdict | Meaning | Rows |
| - | - | - |
| `gone` | Fixed, or retracted with no reachable failure. | 8 |
| `kit` | Shared test support holds the cause: `tests/support`, `tests/e2e/support`, a runner config or a suite's shared helper. | 16 |
| `production` | Product or tooling source holds the cause. | 16 |
| `local` | One test is wrong and no shared cause exists. | 22 |
| Total | One row per line of the audit population. | 62 |

## The two leads

### Lead 1: 1857, 1858, 1863 and 1881 are one harness lifetime gap

Refuted as stated. The class is real, but `createServerHarness` cannot close it.

- 1857 and 1858 do pass a database through the harness: `tests/server/domain/connection/verbs/embed-space-rebuild.int.test.ts:67` and `tests/server/domain/connection/persistence/registry-publication-order.int.test.ts:65`.
- 1863 builds no harness. `tests/support/node/db-faults.int.test.ts:12` calls `freshDb` directly.
- 1881 is a Playwright provider, not a database. `tests/e2e/scripted-chat.spec.ts:118` acquires it, and `:119` awaits before the `try`.
- The harness must keep borrowing. `tests/server/entry/compose/autoindex-lifecycle.int.test.ts:11` and `tests/server/domain/serial-chain-lifetime.suite.int.test.ts:94` run several roots on one database.

The shared cause is smaller: an acquisition returns a handle that is not disposable. Groups K1 and K2 fix that at the acquisition, where the lint already runs.

### Lead 2: 1864, 1866, 1880, 1889, 1895 and 1896 are one settled-turn gap

Refuted as stated. Three of the six share a cause; the other three do not.

| Items | Finding | Cause |
| - | - | - |
| 1866, 1889, 1896 | One gap, group K3 | `typeAndSend` returns void after Enter: `tests/e2e/support/chat-room.ts:204`. |
| 1864 | Its own gap, group K4 | The outsider socket is never read: `tests/server/transport/trpc/stream/_held-room.ts:97`. |
| 1895 | Its own gap, group K5 | A reply plan does not notice an unused reply: `tests/server/domain/chat/engine/core-physical.ts:42`. |
| 1880 | Not a turn, `local` | The case reads card delivery before it settles: `tests/e2e/live-parity-plus-capstone.spec.ts:210`. |

## Open investigations

| Item | Concrete findings | Size |
| - | - | - |
| 1897 | 1: `AF3-B010-finding-391` | Settled, group K11. CTs run production React while the law says development. |
| 1898 | 7: `AF3-B010-finding-351`, `AF3-B010-finding-655`, `AF3-B012-finding-304`, `AF3-B012-finding-333`, `AF3-B012-finding-661`, `AF3-B013-finding-108`, `AF3-B013-finding-273` | All 7 are `local`. No shared cause exists. |
| 1899 | 2: `MAIN-AF3-KEYS-001`, `AF3-B012-finding-295` | One kit helper with 27 call sites, group K10, and one client registry, group P7. |

Item 1952 holds no open finding. Commit `d8684a9455` fixed the three findings of item 1900, and all three read as fixed below. Close 1952.

## Kit groups

### K1: a fresh database is a bare handle

- Findings: 1857, 1858, 1863.
- Cause: `freshDb` returns a plain `Db` at `tests/support/node/db.ts:80`, and `freshHeldDb` and `freshCountedDb` return no closer at `:127` and `:189`. The harness borrows a supplied database by design at `tests/support/node/server.ts:632`.
- Scan: `ast-grep` on `freshDb($$$)` found 29 TS sites in 24 files and 0 TSX sites, over 1835 TS and 580 TSX tracked test files. A regex pass over the same 2415 files covered all database acquisitions.
- Flagged sites: `tests/support/node/db-faults.int.test.ts:12`, `tests/server/domain/connection/persistence/registry-publication-order.int.test.ts:65`, `tests/server/domain/connection/verbs/embed-space-rebuild.int.test.ts:67`.
- Unflagged sites with no closer:
  - `tests/db/schema/provider-row-namespace.int.test.ts:17`
  - `tests/server/domain/chat/persistence/room-reach-rows.int.test.ts:18`
  - `tests/server/domain/chat/verbs/emit-chat-changed-roster-fault.int.test.ts:15`
  - `tests/tooling/seed/ops/demo.int.test.ts:38` and `:60`
- Unflagged sites with a failure window:
  - `tests/server/domain/assets/gc-import-overlap.int.test.ts:69` and `:112`, and `tests/server/domain/assets/verbs/collect-garbage.int.test.ts:294` and `:355`. `tests/server/domain/assets/gc-box.ts:78` can reject before its closer registers at `:91`.
  - `tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts:101` closes only after its assertion at `:106`.
  - `tests/server/entry/boot/persistence/migrate.int.test.ts:38` awaits twice before the helper returns.
- Hand-rolled copies: `defer(() => closeDb(` appears 88 times in 59 files. Each copy is correct, and each is the same two lines.
- Fix: make all three return a holder with `db` and `[Symbol.dispose]`. Callers write `using held = await freshHeldDb()`. Declaration order then closes the graph before the database. Export `ownDb(db)` beside them for `createDb` callers, and delete the hand-rolled copies with a `pnpm codemod` rewrite.
- Rejected: a harness `dbWrap` option. It covers single-root cases only and leaves 1863 and the multi-root suites on a second path.
- Impossible by: the type first, since a `Db` then comes only from a disposable, and `OWNED_DB_RESTRICTIONS` in `eslint.config.ts`, which requires each acquisition to initialize a `using` or sit in a `.use()` call. Biome `useDisposables` alone misses several forms.

### K2: the e2e provider has no disposal

- Finding: 1881.
- Cause: `FixtureProvider` exposes `close` only: `tests/e2e/support/fixture-provider.ts:117`.
- Scan: `ast-grep` found 12 calls in 8 files, 0 in TSX.
- Flagged site: `tests/e2e/scripted-chat.spec.ts:118`.
- Unflagged sites with awaits before their `try`: `tests/e2e/debug-gate.local.spec.ts:61`, `tests/e2e/live-reasoning-strip.local.spec.ts:107`, `tests/e2e/multi-human-visibility.local.spec.ts:443`, `tests/e2e/live-hidden-span-resume.local.spec.ts:87`, `tests/e2e/support/fixture-provider.int.test.ts:52`.
- Clean sites: `tests/e2e/corpus-conversation.spec.ts:66`. `tests/e2e/support/global-setup.ts:246` transfers its provider to the returned teardown.
- Fix: replace `close` with `[Symbol.asyncDispose]`, and use `await using` at every call.
- Impossible by: the same Biome rule, since a held provider now needs a disposal. `tests/e2e/support/global-setup.ts:246` keeps a transfer suppression, as `tests/support/node/corpus-provider.ts:357` does.

### K3: the e2e send driver returns no witness

- Findings: 1866, 1889, 1896.
- Cause: `typeAndSend` presses Enter and returns void: `tests/e2e/support/chat-room.ts:204`. Each caller invents its own proof of a new turn.
- Scan: `ast-grep` found 13 calls in 9 files, 0 in TSX.
- Flagged weak witnesses: `tests/e2e/live-composer-instant-type.spec.ts:35`, `tests/e2e/start-chat-with-character.spec.ts:79` and `:113`, `tests/e2e/rpg-lite-loop.spec.ts:525` and `:533`.
- Unflagged weak witnesses: `tests/e2e/rpg-lite-loop.spec.ts:426` and `tests/e2e/live-names.spec.ts:61`. A seeded greeting satisfies both.
- Sound callers: `tests/e2e/start-chat-with-character.spec.ts:127`, `tests/e2e/multi-tab-room-sync.spec.ts:178`, `tests/e2e/live-routing-honesty.spec.ts:65`, `tests/e2e/live-turn-canon-parity.spec.ts:77`, `tests/e2e/corpus-conversation.spec.ts:73` and `:121`, `tests/e2e/scripted-chat.spec.ts:129`.
- Fix: replace it with a driver that reads `listCanon` before sending and returns the new user and assistant ids. Assert through `messageRow` at `tests/e2e/support/chat-room.ts:54`. Keep a held-reply variant for ghost cases. 1889 also renames its draft-promotion case under D166, and 1896 adds the `flushed` barrier from `tests/e2e/support/rpg-settle.ts:72`.
- Impossible by: the kit API. `typeAndSend` leaves the module's exports, so no caller sends without a witness. Extend ESLint `no-restricted-syntax` to refuse a hand-written `data-role="assistant"` selector in `tests/e2e/*.spec.ts`.

### K4: a stream device exposes frames it never read

- Finding: 1864.
- Cause: `Device.frames` fills only inside `pull`, and `openDevice` stops pulling at `serverReady`: `tests/server/transport/trpc/stream/_held-room.ts:92` and `:97`. `tests/server/transport/trpc/stream/chat-late-join.int.test.ts:100` reads it undrained.
- Scan: 8 files import the helper. `frames).toEqual([])` appears at 5 sites. Only the flagged one is an unread socket.
- Not this class: `tests/server/entry/compose/room-reach.int.test.ts:121` and `:163`, and `tests/server/domain/chat/persistence/room-reach-rows.int.test.ts:61` and `:96`, read a synchronous array after a positive control. `tests/server/transport/trpc/stream/chat-late-join.int.test.ts:154` drains its own device.
- Fix: add a device read that pulls through a barrier on the same socket, then returns the frames. The barrier is a `user` channel event for that account: `packages/contracts/src/stream/index.ts:86`. The lane names the verb that raises it.
- Impossible by: the kit API. A device admitted as an outsider has no `frames` field, only the drained read.

### K5: a scripted reply plan cannot see an unused reply

- Finding: 1895.
- Cause: `coreHttpRoom` refuses overuse and ignores underuse: `tests/server/domain/chat/engine/core-physical.ts:42`. `tests/server/domain/chat/substrate/member-visibility.int.test.ts:77` drops the continuation result, so `:80` and `:82` pass on the first turn alone.
- Scan: `rg` for `exhausted` found the same hand-rolled plan in these homes:
  - `tests/server/domain/chat/scenario-physical.ts:29`
  - `tests/server/domain/chat/composed-root.suite.int.test.ts:38`
  - `tests/server/domain/chat/persona-cache-physical.ts:84`
  - `tests/server/domain/chat/engine/inline-image-physical.ts:129`
  - `tests/server/domain/chat/memory/generate/joined-speaker-label.int.test.ts:34`
  - `tests/server/domain/chat/verbs/speaker-funding-physical.ts:179`
  - `tests/server/domain/chat/verbs/followup-physical.ts:38`
  - `tests/server/domain/imagery/verbs/generation-policy.int.test.ts:53`
  - `tests/server/domain/stats/persistence/retained-cohort.suite.int.test.ts:51`
  - `tests/server/domain/stats/persistence/retained-economic-witness.suite.int.test.ts:57`
  - `tests/support/node/openai-server.ts:49`
- Reach: `coreHttpRoom` has 32 calls in 22 files.
- Fix: one `finiteReplies` in `tests/support`, used by every plan above. Disposal refuses a plan with replies left. 1895 then also asserts the continuation outcome and the host tail.
- Impossible by: the kit API. A plan that leaves a reply unused fails at root disposal, with no assertion to remember.
- Risk: a suite that queues spare replies goes red. Treat each one as a finding, not as a reason to soften the check.

### K6: an absent observation reads as an unavailable backend

- Findings: 1868, 1872.
- Cause: `fetchWireCaptures` parses `enabled` and returns only `captures`: `tests/e2e/support/trpc.ts:205`. `tests/e2e/live-group-modes.spec.ts:120` and `tests/e2e/guided-generations.spec.ts:175` and `:180` turn any product failure into `bail`.
- Scan: `test.skip(` has 48 sites in 17 files. The 3 flagged sites depend on runtime evidence: `tests/e2e/live-round-trip-fidelity.spec.ts:86`, `tests/e2e/live-group-modes.spec.ts:132`, `tests/e2e/guided-generations.spec.ts:192`. The others read fixture selection, viewport, browser or `claudeSub`.
- Unflagged callers of the same helper: `tests/e2e/rpg-lite-loop.spec.ts:434`, `tests/e2e/live-parity-plus-capstone.spec.ts:380`.
- Fix: return a union of disabled and enabled-with-captures. Move both probes to one helper that asks the production read `connection.probe`, at `packages/server/src/transport/trpc/routers/connection.ts:182`, and classifies external unavailability only. A product failure propagates.
- Impossible by: the type. A caller must narrow the union, and only the disabled branch offers a skip reason.

### K7: the corpus page fixture navigates before it yields

- Finding: 1877.
- Cause: `tests/e2e/support/corpus-test.ts:55` and `:59` navigate before `use(page)`, so `tests/e2e/corpus-cold-boot.spec.ts:31` watches too late.
- Scan: 18 files import the fixture. `rg` for first-navigation claims found the two cases at `tests/e2e/corpus-cold-boot.spec.ts:31` and `:39`. `tests/e2e/corpus-shell.spec.ts:100` is an unconfirmed lead the lane reads.
- Fix: add a `coldPage` fixture. It writes the chat style through `client.settings` and yields an untouched page.
- Impossible by: the kit API, for cold cases that use it. Choosing the fixture stays a review check.

### K8: the GC survival predicate hides which store survived

- Finding: 1878.
- Cause: `survives` returns `row && blob` and short-circuits: `tests/server/domain/assets/gc-box.ts:180`.
- Scan: `rg` found 14 calls of `survives` and `survival` across 4 suites. Flagged negatives: `tests/server/domain/assets/verbs/collect-garbage.int.test.ts:290` and `:351`, `tests/server/domain/assets/verbs/export-assets.int.test.ts:58`.
- Unflagged negatives: `tests/server/domain/assets/verbs/collect-garbage.int.test.ts:269`, `tests/server/domain/assets/gc-import-overlap.int.test.ts:106` and `:133`, `tests/server/domain/assets/persistence/asset-refs-unreadable.int.test.ts:79`.
- Fix: replace it with a read that returns `{ row, blob }`, both always read.
- Impossible by: the type. No boolean exists to negate, so a case states both stores.

### K9: a page-side sleep passes the Playwright timeout lint

- Finding: 1879.
- Cause: `playwright/no-wait-for-timeout` at `eslint.config.ts:980` judges one method. `tests/client/data/superseded-writes.ct.tsx:9` puts `setTimeout` inside `page.evaluate`.
- Scan: `rg` found these unflagged sites:
  - `tests/client/features/character/components/new-character-refusal.ct.tsx:15`, the same constant and the same ordering shape
  - `tests/client/features/persona/components/persona-delete-default-notice.ct.tsx:62`
  - `tests/client/features/chat/components/chat-attach-pickers.ct.tsx:133`
  - `tests/client/features/chat/components/jump-to-latest.ct.tsx:136`
  - `tests/client/features/chat/components/platform-history-pagination.suite.ct.tsx:229`
  - `tests/support/browser/surface-measurement.ct.tsx:526`
- Not this class: `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx:1008` waits on a scroll-quiet timer that scroll events reset. Move it to the helper so the rule has no exception.
- Fix: give the two ordering stories a witness of client mutation success. An absence window stays only with a positive control and goes through one named `@orb/testkit/ct` helper.
- Impossible by: a native rule. Add `no-restricted-syntax` on `setTimeout` beside `eslint.config.ts:980` for `.ct.tsx` and `.spec.ts` files.

### K10: `keysOf` claims more than it checks

- Finding: `MAIN-AF3-KEYS-001`, item 1899.
- Cause: a type predicate asserts `keyof T` from `Object.hasOwn`: `tests/support/iso/keys-of.ts:5`.
- Scan: 27 calls in 23 files, by both `ast-grep` and `rg`. The arguments are `SEED_THEME_VALUE_SETS`, `BUTTON_BOX_OVERFLOW`, `TOKENS`, `DOOR_BOXES` and `ACTION_DISPOSITIONS`. All are closed records, so no caller fails today.
- Fix: delete the predicate. Iterate each record's owning tuple. Where production has no tuple, export the one production reads, because `pnpm knip:prod` refuses a test-only export.
- Impossible by: `tsc`, since the helper no longer exists. `tooling/src/codemods/keys-of-record` is the rewrite's starting point.

### K11: component tests run production React

- Finding: `AF3-B010-finding-391`, item 1897.
- Cause: `docs/law/Spine-Testing.md:146` says development React. `playwright-ct.config.ts:27` runs `vite build --mode component-test` and `:32` sets no `NODE_ENV`. A Vite build defaults to production, and `--mode` does not change `NODE_ENV`.
- Evidence: a current gallery build holds `Minified React error` in 2 chunks and no development-only React message. Production React does not repeat effects, so `playwright/index.tsx:52` wraps StrictMode with no effect replay.
- Fix: the law stands, so set development mode in the CT server environment at `playwright-ct.config.ts:32`. Any CT that goes red under replayed effects is a finding.
- Impossible by: a gallery case in `tests/support/browser/gallery.ct.tsx` that counts a story's effect setup and requires a replay.
- Decision: if the owner prefers production React, amend Spine-Testing instead. The default is the law.

## Production groups

| Group | Item | Cause | Other sites searched | Fix | Impossible by |
| - | - | - | - | - | - |
| P1 | 1853 | `packages/server/src/infra/auth/jwks.ts:104` accepts a request-supplied literal key set; only the URL path checks the allowlist. | The literal path is the only key source without an operator check. | Bind keys to an operator source and refuse the literal on the public path. | A type: the verifier takes an operator key source, not a request string. |
| P2 | 1861 | `packages/server/src/domain/import/loader/collect.ts:214` admits a name from a listing; `packages/server/src/infra/storage/stage-dir.ts:19` guards only the final leaf. | Both planes: `collect.ts:503` and `:706`. | Read through a parent directory handle held since the listing, or enforce an inaccessible staging namespace. | A production API: the listing returns a read capability, not a name. |
| P3 | 1875 | `packages/server/src/domain/plugin/substrate/bridge.ts:178` counts, and `:182` writes, as separate awaits. | `rg` on ceilings in `domain/plugin`: `ui-host-call-gate.ts:42` holds its count synchronously. None other. | Make count and write atomic per plugin and book. | Review plus an overlapping near-ceiling case. |
| P4 | 571 | `tooling/src/snap/ops/run-bundle.ts:178` and `tooling/src/snap/ops/session-daemon.ts:106` persist raw argv. | `session-evidence.ts:201` serializes the row whole. | One disk-safe argv projection at both writers. | A type: writers accept only the projected argv. |
| P5 | 1886 | `packages/inference/src/backends/local-light/model-cache.ts:602` loses a loaded encoder when the head rejects. | `Promise.all` in `local-light`: `st-head.ts:110` and `:133` hold no native resource; `model-cache.ts:672` and `:675` join memos. None other. | Load the head first, or settle both and dispose the encoder. | Review plus a failed-head disposal case. |
| P6 | 1888 | `packages/client/src/features/databank/surfaces/databank-detail-surface.tsx:138` and `packages/client/src/features/plugin/surfaces/extensions-page-surface.tsx:110` render nothing with no data. | All `data-ready` roots: `preset-library-welcome.tsx:93` is healthy. | Render an owned offline or error state; assert it at `tests/client/features/app-shell/surfaces/platform-overflow-room.suite.ct.tsx:210`. | Review plus a cold offline case. |
| P7 | 1899 | `packages/client/src/features/character/lib/character-card-facets.ts:52` claims completeness with an array; `:129` casts the lookup. | `rg` on `.find(...) as`: no other site in `packages/client` or `packages/ui`. | A total `Record` over the id union, with order from the tuple. | `tsc`. |
| P8 | 1865 | `tooling/src/ui-audit/ops/walker/census-interactive-navigability.ts:44` splits on the letter `s`. | `tooling/src/ui-audit/ops/walker/census-text.ts:379` has the same text; `census-cohort.ts:223` documents the trap. | Fix both lines. | ESLint `no-restricted-syntax` on `TemplateElement` text `/s+/` in the walker directory. |
| P9 | 1869 | `tooling/src/bug-reports/lib/read.ts:178` maps every `readdir` failure to missing. | Leads to read: `platform-probes.ts:250`, `artifact-pointer.ts:300` and `:332`, `artifacts.ts:170`. | Catch `ENOENT` only. | Review plus a regular-file control. |
| P10 | 1893 | `tooling/src/snap/lib/run-report-columns.ts:102` and `:103` turn a missing counter into 0. | `rg` on `Number(` over a nullable pair: no other site. | Test presence before converting. | A type: the pair read returns a number or absent. |
| P11 | 1885 | `tooling/src/motion-audit/ops/page-validate.ts:34` checks the list; `:47` casts its rows. | That cast is the only one in `motion-audit/ops`. | Validate each consumed row field. | The boundary parse. |
| P12 | 1856 | `tooling/src/snap/lib/run-finding-browser.ts:52` fixes the population the writer may legitimately exceed. | `failedRequests` and `captures` match their writers. | One shared population contract. | A type shared by writer and reader. |
| P13 | 1873 | `tooling/src/snap/lib/run-finding-analyzers.ts:49` gives an exemption `countedBy`. | `countedBy` sites at `:66`, `:118`, `:157` and in `run-finding-browser.ts` count real failures. | Name a non-counting exemption disposition. | A `Record` over problem kinds. |
| P14 | 1862 | `tooling/src/snap/ops/session-registry.ts:153` loops forever on `EEXIST`, before `tooling/src/snap/ops/session-client.ts:200` has a deadline. | `withBandsLock` and `tooling/src/stack/lib/spawn-lock.ts:61` are already bounded. None other. | Reuse the band lock discipline. | Review plus an abandoned-lock case. |
| P15 | 1884 | `tooling/src/floor/artifacts/artifacts.ts:306` publishes aliases one by one. | Single caller path through `publishRunSlot`. | One serialized family publication. | A two-publisher pause control. |
| P16 | 1874 | `tooling/src/unwired/unions.ts:299` keeps constructed text with no owner, and `:243` repeats that. | Both engines hold the gap. | Keep tuple identity on each construction. | A planted shared-member fixture. |

## Finding table

| Finding | Item | Verdict | Group | Evidence |
| - | - | - | - | - |
| `B018-227` | 1901 | `local` | - | `tests/kit/rerank/apply-rerank.test.ts:64` caps two inputs at 10, so `packages/kit/src/rerank/index.ts:36` is never exercised. |
| `AF3-B006-finding-001` | 1863 | `kit` | K1 | `tests/support/node/db-faults.int.test.ts:12` |
| `AF3-B008-finding-001` | 1886 | `production` | P5 | `packages/inference/src/backends/local-light/model-cache.ts:602` |
| `AF3-B010-finding-351` | 1898 | `local` | - | `tests/client/components/viewer-dialog.ct.tsx:8` tabs once from an unknown start. |
| `AF3-B010-finding-377` | 1871 | `local` | - | `tests/client/data/bus/post-event-source.dom.test.ts:273` advances 1 ms, then the test unsubscribes before the deadline. |
| `AF3-B010-finding-391` | 1897 | `kit` | K11 | `playwright-ct.config.ts:27` |
| `AF3-B010-finding-533` | 1879 | `kit` | K9 | `tests/client/data/superseded-writes.ct.tsx:24` |
| `AF3-B010-finding-654` | none | `gone` | - | Retracted by the audit. `tests/client/data/import-tree-plan.int.test.ts:367` stays a sound ordering case. |
| `AF3-B010-finding-655` | 1898 | `local` | - | `tests/client/data/import-tree-plan.int.test.ts:315` counts the skip; `packages/client/src/data/import-tree-plan.ts:154` sets the reason. |
| `AF3-B012-finding-295` | 1899 | `production` | P7 | `packages/client/src/features/character/lib/character-card-facets.ts:52` |
| `AF3-B012-finding-304` | 1898 | `local` | - | `tests/client/features/automation/components/platform-rule-action-groups.suite.ct.tsx:248` proves inequality, not destructive ink. |
| `AF3-B012-finding-311` | 1870 | `local` | - | `tests/client/features/automation/components/rule-editor-unmount-failure.ct.tsx:47` races the debounce. `holdServed` already exists for the repair. |
| `AF3-B012-finding-333` | 1898 | `local` | - | `tests/client/features/automation/components/platform-rule-action-groups.suite.ct.tsx:292` reads a request; `:115` shows the stored read it can use. |
| `AF3-B012-finding-362` | 1888 | `production` | P6 | `packages/client/src/features/databank/surfaces/databank-detail-surface.tsx:138` |
| `AF3-B012-finding-661` | 1898 | `local` | - | `tests/client/features/app-shell/surfaces/platform-topbar-overflow.suite.ct.tsx:116` accepts any dialog. |
| `AF3-B013-finding-108` | 1898 | `local` | - | `tests/client/features/chat/components/_flank-column-stories.tsx:15` sets `panelMode: true`; the case at `platform-flank-column-sheet.suite.ct.tsx:41` claims no slide. |
| `AF3-B013-finding-273` | 1898 | `local` | - | `tests/client/features/config/lib/theme-css-warnings.test.ts:34` passes when no warning exists. One `ast-grep` match in TS, this site. |
| `AF3-B023-finding-001` | 1858 | `kit` | K1 | `tests/server/domain/connection/persistence/registry-publication-order.int.test.ts:65` |
| `AF3-B023-finding-002` | 1857 | `kit` | K1 | `tests/server/domain/connection/verbs/embed-space-rebuild.int.test.ts:67` |
| `AF3-FSEC-Q0004` | 1860 | `local` | - | `tests/inference/roles/side-gen.int.test.ts:554` checks the tag, not the reasoning text from `:549`. |
| `AF3-FSEC-Q0005` | 1882 | `local` | - | `tests/inference/roles/side-gen.int.test.ts:372` accepts any string. Unflagged second site: `tests/inference/backends/anthropic-messages/chat-wire.int.test.ts:186`. |
| `AF3-FSEC-Q0006` | 1867 | `local` | - | `tests/server/domain/embeddings/verbs/memory-ops.int.test.ts:42` and `:46` are both refusals; no allowed path runs. |
| `AF3-FSEC-Q0007` | 1876 | `local` | - | `tests/server/domain/search/verbs/rerank-consumers.suite.int.test.ts:337` maps an unknown character to `other`, so `:363` cannot see it. |
| `AF3-E2EFOUND-Q001` | 1889 | `kit` | K3 | `tests/e2e/start-chat-with-character.spec.ts:79` |
| `AF3-E2ESYNC-Q001` | 1881 | `kit` | K2 | `tests/e2e/scripted-chat.spec.ts:118` |
| `AF3-B032-Q001` | 1883 | `local` | - | `tests/support/node/plugin-lifetime.int.test.ts:69` and `:70` make 2 attempts under the ceiling at `packages/server/src/domain/plugin/substrate/snippet-gate.ts:28`. |
| `AF3-B032-Q002` | 1895 | `kit` | K5 | `tests/server/domain/chat/substrate/member-visibility.int.test.ts:77` |
| `AF3-B032-Q003` | 1877 | `kit` | K7 | `tests/e2e/support/corpus-test.ts:55` |
| `AF3-B032-Q004` | 1896 | `kit` | K3 | `tests/e2e/rpg-lite-loop.spec.ts:525` |
| `AF3-B032-Q005` | 1890 | `local` | - | `tests/e2e/live-hidden-span-resume.local.spec.ts:146` joins all frames, so `:151` and `:160` accept committed views. The whole-byte reads in `tests/e2e/live-reasoning-strip.local.spec.ts:181` claim no delta channel. |
| `AF3-B032-Q006` | 1859 | `local` | - | `tests/e2e/multi-human-visibility.local.spec.ts:402` and `:404` contradict the held pin in `docs/adr/0315-persona-pointers-one-writer-pin-read-through-chat.md:20`. |
| `AF3-B032-Q007` | 1864 | `kit` | K4 | `tests/server/transport/trpc/stream/chat-late-join.int.test.ts:100` |
| `AF3-B032-Q008` | 1880 | `local` | - | `tests/e2e/live-parity-plus-capstone.spec.ts:210` reads the pending frame's sandbox. |
| `AF3-B032-Q009` | 1894 | `local` | - | `tests/e2e/live-names.spec.ts:55` takes the expected name from the DOM; `:44` discards the catalog row. |
| `AF3-B036-2507` | 1865 | `production` | P8 | `tooling/src/ui-audit/ops/walker/census-interactive-navigability.ts:44` |
| `AF3-B036-2673` | none | `gone` | - | Retracted: no reachable failure. `tooling/src/ui-audit/ops/walker/census-text.ts:379` still splits on `s`; P8 fixes the line. |
| `AF3-B038-267` | 1900 | `gone` | - | `tests/tooling/issue-form-guidance-integrity.test.ts:70` asserts `validations.required`. |
| `AF3-B038-979` | 1900 | `gone` | - | `tests/tooling/vite-gallery-config.test.ts:67` reads the emitted script; `:69` holds the control. |
| `AF3-B039-104` | 1869 | `production` | P9 | `tooling/src/bug-reports/lib/read.ts:178` |
| `AF3-B039-579` | 1884 | `production` | P15 | `tooling/src/floor/artifacts/artifacts.ts:306` |
| `AF3-B041-435` | 1885 | `production` | P11 | `tooling/src/motion-audit/ops/page-validate.ts:47` |
| `AF3-B042-37` | 1873 | `production` | P13 | `tooling/src/snap/lib/run-finding-analyzers.ts:49` |
| `AF3-B042-250` | 1893 | `production` | P10 | `tooling/src/snap/lib/run-report-columns.ts:102` |
| `AF3-B046-538` | 1874 | `production` | P16 | `tooling/src/unwired/unions.ts:299` |
| `AF3-TSSEC-Q0003` | 1855 | `gone` | - | `tooling/src/stack/lib/stack-plan.ts:115` uses `pathOccurrences`; `tests/tooling/stack/lib/stack-plan.test.ts:127` holds the foreign-prefix control. |
| `AF3-TSSEC-Q0004` | 1887 | `local` | - | `tests/tooling/stack/index.int.test.ts:199` ORs the platform into the value asserted false. |
| `AF3-TSSEC-Q0005` | 1862 | `production` | P14 | `tooling/src/snap/ops/session-registry.ts:153` |
| `AF3-TSSEC-Q0006` | 571 | `production` | P4 | `tooling/src/snap/ops/run-bundle.ts:178` |
| `AF3-TSSEC-Q0007` | 1891 | `local` | - | `tests/tooling/snap/ops/stage-holders.int.test.ts:91` and `tests/tooling/snap/ops/stage-census.test.ts:72` need Linux start ticks. |
| `AF3-TSSEC-Q0008` | 1855 | `gone` | - | `tooling/src/snap/ops/stage-probe.ts:107` uses whole-segment `pathOccurrences`; `tests/tooling/snap/ops/stage-rooted.int.test.ts:18` holds the lookalike control. |
| `AF3-TSSEC-Q0009` | 1854 | `gone` | - | `tooling/src/floor/process/run-marker.ts` routes every sweep signal through `incarnationGuard`; `tests/tooling/floor/process/run-marker.test.ts:160` holds the replacement control. |
| `AF3-TSSEC-Q0010` | 1856 | `production` | P12 | `tooling/src/snap/lib/run-finding-browser.ts:52` |
| `AF3-TSSEC-Q0011` | 1878 | `kit` | K8 | `tests/server/domain/assets/gc-box.ts:180` |
| `AF3-TSSEC-Q0012` | 1861 | `production` | P2 | `packages/server/src/domain/import/loader/collect.ts:214` |
| `AF3-TSSEC-Q0013` | 1875 | `production` | P3 | `packages/server/src/domain/plugin/substrate/bridge.ts:178` |
| `AF3-SERVERSEC-Q0001` | 1853 | `production` | P1 | `packages/server/src/infra/auth/jwks.ts:104` |
| `MAIN-AF3-KEYS-001` | 1899 | `kit` | K10 | `tests/support/iso/keys-of.ts:5` |
| `MAIN-AF3-FLAGSET-001` | 1900 | `gone` | - | `tests/tooling/snap/ops/matrix-contract.test.ts:52` asserts each checkpoint has no forbidden flag; `:64` holds the control. |
| `MAIN-AF3-INSTANTSEND-001` | 1866 | `kit` | K3 | `tests/e2e/live-composer-instant-type.spec.ts:35` |
| `MAIN-AF3-CAPTURESKIP-001` | 1868 | `kit` | K6 | `tests/e2e/support/trpc.ts:205` |
| `MAIN-AF3-CYOASETUP-001` | 1892 | `local` | - | `tests/e2e/live-parity-plus-capstone.spec.ts:262` sets `cyoa` only; `packages/contracts/src/rpg/config.ts:76` defaults the click to `compose`. |
| `MAIN-AF3-LIVEPROBE-001` | 1872 | `kit` | K6 | `tests/e2e/live-group-modes.spec.ts:120` |

## Work order

Run kit lanes first. Every lane reds its defect control on old source before the fix, and every lane fixes all listed sites.

| Lane | Rows | Owner area | Done when | Defect control that must go red | State |
| - | - | - | - | - | - |
| L1 testkit lifetime | K1 | `tests/support`, codemod over `tests/**` | No `closeDb` defer remains beside a fresh database, and all unflagged sites use the holder. | Drop one `using`: Biome fails. A held read after scope exit rejects. | Safe now |
| L2 e2e drivers | K2, K3, K6, K7; local 1859, 1880, 1890, 1892, 1894 | `tests/e2e/support`, `tests/e2e` | `typeAndSend` is unexported and every send returns ids; both probes share one classifier. | A retained matching row with no send fails; a failed mint closes the provider; enabled-but-empty capture fails. | Code safe now. `@live` proof needs the orchestrator to stop the stack. 1880 is a sandbox case: flag it for `security-builder`. |
| L3 server suite helpers | K4, K5, K8; local 1867, 1876, 1883 | `tests/server`, `tests/support` | Every reply plan uses `finiteReplies`; `survives` is gone. | Bypass the membership projection: the outsider case fails. Skip the second continuation: disposal fails. Skip the CAS remove: GC cases fail. | Safe now. 1864, 1867 and 1876 are privacy rows: flag them for `security-builder`. |
| L4 inference and kit | P5; local 1860, 1882, 1901 | `packages/inference`, `tests/inference`, `tests/kit` | A failed head disposes the encoder once; both digest sites pin format and owner contrast. | Keep the tag strip and leak the body; send the raw owner id; remove the early slice. | Safe now. 1882 is a privacy row: flag it for `security-builder`. |
| L5 server product batch | P1, P2, P3 | `packages/server` | Each item's done line in its work item holds on a native case. | A caller-signed token with its own literal key is refused; a late parent swap imports nothing; overlapping near-ceiling writes stay at the cap. | Safe now. All three go to `security-builder`, 1853 first. |
| L6 tooling diagnostics | P4, P8 to P16; local 1887, 1891 | `tooling/src`, `tests/tooling` | Each listed cause is fixed at its reader or writer, with the P9 leads read. | Each item's stated counterexample fails first. | Safe now, except no edit to `tooling/src/ui-facts`. 571 goes to `security-builder`. |
| L7 client after merge | K9, K10, K11, P6, P7; local 1870 and the five CT rows of 1898 | `tests/client`, `tests/ui`, `packages/client`, `playwright-ct.config.ts` | No page-side sleep remains outside the helper; `keysOf` is deleted; a gallery case proves effect replay. | Withhold the second success; omit a facet id; run the gallery in production mode. | Waiting for the UI branch |
| L8 client non-CT | Local 1871, `AF3-B010-finding-655`, `AF3-B013-finding-273` | `tests/client` | Each case fails on its stated counterexample. | Remove the deadline; change the reason; suppress the warning. | Safe now: test files only. |

Run K11 first inside L7: replayed effects can turn other CTs red, and those reds should not mix with the rest of the lane.

Close 1952 against `d8684a9455`. Item 1854 and item 1855 need no further work.
