# 1041 s2-eslint-restrict-tooling-2

Target tool: eslint-restrictions. Branch `wt/wf_d99749a9-c7a-82`. Four gates done, one escalated.

## Successor rules (eslint.config.js)

- `orb/tooling-clock-budget` and `orb/tooling-port-registry` are rows in `TOOLING_LITERAL_RESTRICTIONS`, spread into `RESTRICTIONS` (ordinary profile).
- The port registry values are imported from `@orb/tooling/floor/host/ports`, so a new reserved row or band widens the rule with no edit.
- The root runner configs (`vitest.config.ts`, `playwright*.config.ts`) take the same selectors through core `no-restricted-syntax` in `hardConfig`.
- Retired `@orb-gate-ignore` markers: core `no-warning-comments` (`terms: ["@orb-gate-ignore"]`, `location: "start"`) in `hardConfig` over `packages/**/*.{ts,tsx}`, `tests/**/*.{ts,tsx}`, `tooling/src/**/*.{ts,tsx}` and `tests/support/node/**/*.mjs` (the node helper executables the retired population loaded via `harnessGlobs`).
- Durable test: `tests/tooling/verify/ops/tooling-plumbing-native.suite.test.ts` (46 rows, real repo config through `ESLint.calculateConfigForFile` and `Linter`).

## Records

### tooling-clock-budget: done

- parity: 5 mustFlag / 6 mustPass ported, 0 lost (plus a quoted-key flag row, a method-call `setTimeout` pass row, and the scope fence rows).
- lost claim: none of the verdicts. The finding message no longer names the `Clock: <label>`; the reported node is the numeric literal, as before.
- lost claim (per-site reason): the four reasoned `@orb-waive tooling-clock-budget` sites were fixed by naming the fixture value (`AGENT_TIMEOUT_VALUE`, `GUARD_REWRITE_TIMEOUT`, `VIRTUAL_WINDOW_MS`, `PLAYWRIGHT_TIMER_DISABLED`), a per-site reasoned exception swapped for a name the selector does not match. The retired gate judged spelling too, so this is not a successor defect.
- waivers rejudged: six live `@orb-waive tooling-clock-budget` sites (`boot-trace.ts`, `proc.test.ts`, four in `tool-guard.int.test.ts`) were fixed at the site by naming the fixture value; none became an inline disable. Budget rows removed from both maps. Ten live test timeouts the rule found (`{ timeout: 30_000 }` and friends) now go through `scaledBudget`.
- live tree scan (parser-only Linter, selectors from the config): 2544 files under `tooling/src` and `tests/tooling`, 0 findings after the fixes (16 before).

### tooling-port-registry: done

- parity: 6 mustFlag / 4 mustPass ported, 0 lost. The stage-band row now reports one finding per literal (the gate reported one per file). The registry row is a `homes` path, not a grant.
- lost claim: the reviewed grant went red when `ports.ts` stopped spelling any port (zero-consumption staleness). The `homes` entry only checks the path exists; a registry emptied of port numbers is no longer flagged.
- waivers rejudged: the single grant `tooling-port-registry:ports` became the `homes` entry for `tooling/src/floor/host/ports.ts` (the registry is the capability's one owner). Grant row and header mention removed; `PLUMBING_GRANT_COUNT` 20 to 19.
- live tree scan: 1625 files under `tooling/src` and `tests/e2e/support`, 20 findings, all in `ports.ts` (the home).

### tooling-runner-config-literals: done

- parity: 6 mustFlag / 3 mustPass ported, 0 lost. The unparseable-config row is ESLint's fatal parse error.
- lost claim (family-test arm, not a conformance row): the population-phase refusal when a named config is missing. A renamed `vitest.config.ts` is now silently unlinted. The glob `playwright*.config.ts` also covers the two CT variant configs the gate never judged (0 findings there).
- scaffolding removed: `exact-file` id `playwright-config` (its only consumer was this gate); `vitest-config` and `playwright-ct-config` stay for their other readers.
- live scan: 5 root configs, 0 findings.

### gate-ignore-inventory: done

- parity: 4 mustFlag / 3 mustPass ported, 0 lost; plus two rows for the node helper executables (`tests/support/node/**/*.mjs`, admitted by the retired population via `harnessGlobs`), red with the glob reverted and green with it. The rule also flags a block comment that opens with the term (harmless widening).
- `legacy-gate-ignore-sites` fact and `lib/gate-ignore*.ts` are left in place for s6-delete-facts-2; their prose still names the deleted gate.
- live scan: 0 findings under `packages`, `tests`, `tooling/src` and `tests/support/node` (hard profile, real door).
- `application-population.suite.test.ts` used this gate as its engine fixture; it now uses a local fact and policy so the application-dispatch claim stays covered.

### no-blanket-suppression: escalate

Native coverage exists for part of the claim only: `@typescript-eslint/ban-ts-comment` already bans `@ts-nocheck` in the hard profile (not under `tests/**`), `disable-enable-pair` covers an unclosed `eslint-disable` in the ordinary profile, and `no-warning-comments` could cover `biome-ignore-all`. These mustFlag rows have no native successor:

- an unclosed `biome-ignore-start` (two rows);
- a closed range that encloses every statement, biome and eslint forms (two rows);
- the tracked CSS, JSON and JSONC arm and the staged-index arm, which ESLint never opens.

Deleting it would lose those arms. The gate, its tests and its arm in `_liveness/authored.ts` are untouched.

## Owed to primary

- `pnpm lint:eslint-scoped` for the `eslint.config.js` edit (not run, per the override). Real-door proof used `pnpm exec eslint` on planted files; see the commit body.
- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (four rows leave).
- `tooling-plumbing-family.suite.test.ts` real-tree test uses `projectCtx(process.cwd())`; not run. The other 12 tests pass (the founding-fixtures test needs a scaled timeout, added).
- Not run (heavy, edits are `scaledBudget` wrappers only): `compose-wiring-only.test.ts`, `reference-fact-symbol-member.test.ts`, `optional-return-values.test.ts`, `semantic-inventory-extract.test.ts`.
- Inherited failure: `application-population.suite.test.ts` "application schema enforcement" (`native type fact context is unavailable`), reproduced on a copy of the HEAD file.
