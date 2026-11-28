# Review: main, 2026-11-14 to 2026-11-27, and `tooling/src/unwired/`

Two passes:

1. A review of main's commit log for those two weeks, with `docs` and `chore(work)` commits filtered out.
2. A whole-file read of all 79 files (43.6k lines) of `tooling/src/unwired/`.

The second pass split the files across five parallel readers. Every finding marked **confirmed** below was then checked against the source by hand.

## Part 1: main's commit history

The window holds about 1,950 commits; 1,215 remain after the filter.

### Good
- **Nearly every commit has a real body.** Only about 32 of the 1,215 have one line of body text or less, and those are mostly 1-2 line diffs. A typical body states the fault, the reason, what was kept, and a `Floor:` line saying what ran. Several carry a red proof (`00aab82f`, `3959600e`).
- **No unsafe casts in product code.** No `as any`, `as unknown as` or `: any` was added in `packages/*/src`.
- **Suppressions carry reasons.** Most new ones are `@ts-expect-error` type tests.
- **Bodies are honest about red.** They say "inherited from main" or "owed to the first CI run" rather than claiming everything is green.

### Smells
- **Deleting by scanner verdict broke things.** The Nov 27 cleanup wave:
  - `0be210ef`: dropping the `ParticipantRole` alias silently switched off half of `orb/role-comparison`.
  - `5fd75abd`: a lane cut `CollectedCard.handle` from a base 41 commits behind main, while main had just added readers.
  - `a1b629c6` was reverted by `5862fe76`, and the revert has no body. The reason exists only in work item 4113.
- **Known-red first-parent commits.** About 31 bodies say "stays red until main generates the migration". Each is a broken point for `git bisect` unless it runs with `--first-parent`.
- **A WIP commit landed on main.** `b4989289`: "removed-keys runs on the reference graph (work in progress)".
- **Fixes outnumber features in UI scopes.** ui has 50 `fix` commits to 8 `feat`; chat has 99 to 44.
- **Board noise.** About 720 `chore` commits; the `chore(work)` board writes bury `git log`.

## Part 2: `tooling/src/unwired/`

### Capability: real
- **What it sees that knip, tsc and eslint do not:**
  - Field-level reads, writes and sends.
  - Union members nothing builds.
  - tRPC procedures with no caller, traced through the client proxy.
  - Hono routes and path params no handler reads.
  - Drizzle columns nobody reads or writes.
  - Error codes thrown but never branched on.
  - A delete trial that really deletes, re-typechecks and bisects.
  - A `census` that checks the graph against find-references.
- **Product bugs it surfaced:**
  - 3849: machine-written lore entries lost their seat.
  - 3885: eight of the runner's ten event kinds had no reader.
  - 3835: refusal codes the client never branched on.
  - Timestamps the app collected and never showed (3776 and related).
- **It works through the checker.** Library members are confirmed against the package that declares them. Limits print on every run. Give-up points are counted.
- **The D357 migration is finished.** The old per-scan engines are deleted.

### Cost
- 277 work items were filed under `plan: unwired-code` in two weeks:
  - 137 `tooling` items: the scanner fixing itself.
  - 112 `work` items.
  - 27 `bug` items, about half of them product bugs.
- Roughly 360 commits touched the tool in the window, and it is now about 43.6k lines plus 20.6k lines of tests.

### The tool breaks the law it enforces
- **"key-resolver.ts is the one place" is false.**
  - `resolveKeys` has one caller, `graph/removed-keys.ts:605`.
  - `graph/resolve.ts` is a second, larger origin engine that also claims "the one way".
  - `union-slots`, `keys`, `params`, `optional-pairs`, `trial` and `literal-hits` each match names to members on their own.
- **Duplicated helpers.**
  - Five `unwrap` variants: resolve.ts:238, values.ts:90, unions.ts:232, union-slots.ts:950, slots.ts:83. The hand-written loops in params, removed-keys and judge are more copies.
  - Three property-by-name helpers: native.ts:693, resolve.ts:392, state.ts:534.
  - `returnsOf` five times: urls.ts, message-doors.ts, open-sends.ts, values.ts, held.ts.
  - `isFunctionLike` declared again in message-doors.ts and held.ts, although native.ts exports it.
  - `sameNode` three times: roles.ts, library-names.ts, open-sends.ts.
  - Four `nodeKey` formats.
  - `SyntaxRole` declared twice, with different members (roles.ts:457, classify.ts:14).
- **TS6 leaks past the ruled exception.** `deliberate.ts:11` imports TS6, and every scan calls it. D357 says the ports census is the one TS6 module.
- **A re-export chain.** `index.ts` re-exports ESLint helpers that nothing imports through it, a pattern the shapes scan itself reports as a delete.

### Bugs confirmed by hand
| Where | Bug | Effect |
| - | - | - |
| `graph/removed-keys.ts:635`, `key-resolver.ts:697` | `const input = { gone: 1 } as const; mutate(input)`: the key resolves to the literal's own property symbol, so the verdict is `other` and the check passes silently. Every fixture passes the literal inline. | Misses the exact sender its header names. **Fix first.** |
| `coverage.ts:415` | `{ ...browser.map, ...server }` is keyed by path, so for files both sides load (kit, contracts) the server map overwrites the browser's. | Code only the browser ran is reported as never executed. |
| `open-sends.ts:694` | `&&` is treated as consuming both operands, but `x && row` hands `row` on. | The chase stops early, so live members read as unescaped. |
| `open-sends.ts:398` | `usesOf`'s comment says it skips nested functions that rebind the name; the code walks into everything and also counts `{name: ...}` keys. | Wrong uses feed the send verdicts. |
| `graph/variance.ts:157-194` | A generic walked while another generic is mid-cycle is cached in `#done` with a partial answer. | Results depend on walk order; backward flows are missed. |
| `graph/scan.ts:255` | The `unions`, `shapes`, `dom` and `removed-keys` verbs each run a full `buildGraph`, then use only `world()`. | Memory and time spent against the documented memory bar. |

### Reported by the readers, not verified by hand
- **Stale judged rows.** About 30 rows in `judged-fields.ts` point at closed items (3738, 3751, 3757, 3779, 3784, 3790, 3797, 3800). Nothing prunes them, and nothing fails on stale rows.
- **Silent truncation.** `union-slots.ts:2645`: `keyTuples` truncates at `SPELLING_LIMIT` without saying so.
- **Wrong sibling slot.** `slots.ts:461-475`: `coInferredSlots` never checks that the sibling parameter takes the `T`.
- **Codes go empty silently.** `codes.ts:1057`: a missing error-mapping file yields an empty `thrown` map, and every vocabulary drops out.
- **Exact-set matching.** `codes.ts:903`: a vocabulary matches a field only on an exact literal-set match, so a field typed by `Extract<>` never matches.
- **A dated keep.** `deliberate.ts:451` cites "owner ruling 2026-11-27" instead of a D-number.
- **Campaign scaffolding.** `port-targets.ts:386-402` and `:558-565` hardcode one rewrite campaign's lanes; `port-census.ts:562` hardcodes `D117_DOOR`.
- **Double build.** `port-census.ts:983` and `:1012` build each world's TS6 program twice.
- **Ungated trial ledger.** `trial-ledger.ts:28` ignores untracked files, and its zod check verifies only that `verdict` exists.
- **Stale work item.** 4102 says no verb reports uncalled Hono routes, but `procedures.ts:590-612` does.
- **Missing direct tests:**
  - key-resolver steps: mapped, row-column, keyof, generic.
  - urls.ts, selectors.ts, spellings.ts, patterns.ts, pprof.ts, judged.ts, doors.ts, handoffs.ts, list-methods.ts.
  - No test merges a browser and a server map that hold the same file.
- **Accretion.** `union-slots.ts` (2.7k lines) and `sites.ts` (2k lines) grow one special form per design bullet. `union-slots.ts` has three property readers and three binding models; `sites.ts` keeps a ~50-array `FileSites`.

### Recommendation
Freeze new verbs and spend one leg consolidating:
1. Fix removed-keys for variable-held and `as const` senders, with a fixture for each.
2. Fix the other five confirmed bugs.
3. Fold to one key resolver, plus one home each for unwrap, property lookup, `returnsOf` and `nodeKey`.
4. Drop TS6 from `deliberate.ts`.
5. Let lazy verbs skip the graph build.
6. Prune the stale judged rows.

## Appendix: remaining reader findings, by slice (not verified by hand)

### Graph core (build, scan, analyse, resolve, sites, roles, state, members, fields, query, ...)

**Liveness that rides on other inputs or other verbs**
- **Roots come from knip's config.** A wrong or missing knip entry makes a whole subgraph read dead (roots.ts:139-187). Module and export liveness largely repeats knip.
- **A computed `import(x)` adds no edge.** It is reported, but no edge is made, so the module it loads looks unreached (sites.ts:1213-1219).
- **Lost reads credit no member.** There are ten lost-read slots (state.ts:101-112). Only `any-receiver` is shown to a person (fields.ts:914). The other nine silently leave rows reported "never-read". FIELD_LIMITS concedes this (fields.ts:887).
- **Reads inside strings are invisible.** JSON, CEL and SQL text never credits a member.
- **The same tree can bucket differently per verb.** `trialGraph` without verdicts and `queryGraph` use `NO_SITES` (scan.ts:442, 497), which changes the build-script read credit (analyse.ts:358-366).

**Name and regex keeps (false negatives)**
- Any member named `then`, `toString`, `valueOf` or `toJSON` counts as runtime-called (sites.ts:757, 1803).
- Any written `aria-*` member counts as used (analyse.ts:685).
- A class value handed on with no typed slot keeps every member alive (build.ts:1143-1149).
- Registry staleness is judged by bare server names (analyse.ts:149, spellings.ts:54-60).

**Name matches with no library check**
- `Pick`, `Omit`, `Extract` and `Exclude` (sites.ts:758-759, 1715).
- `KEY_ARGUMENT` and `Record` (resolve.ts:161-168, 1246, 1384).
- The `tv` prefilter (sites.ts:2037).
- `window.X` reads are found by regex over every string literal (sites.ts:968-1001).

**Hardcoded repo knowledge**
- Paths: `tooling/src/snap/`, `tooling/src/floor/instrument/`, `tests/` (state.ts:47-51); `tests/support/` and `playwright/` (analyse.ts:611).
- `@orb/ui` internals: `STAMPED_VARIANT_AXES`, `TONES` and the D336 tone-door rule (analyse.ts:23-25, 591-602).
- ESLint `placementOf` (analyse.ts:27) and `PACKAGE_EFFECT_CLASS` (roots.ts:311).

**Structure**
- `kindOf` (build.ts:173) re-parses `DeclKey` beside `declKeyParts`.
- `MEMBER_KINDS` means two different things (sites.ts:308, members.ts:32).
- fields.ts:897 re-parses a formatted string through an `as SendDestination` cast.

**Performance**
- query.ts:61 copies the adjacency array on every edge, which is quadratic.
- `#docLinksTo` scans every doc edge for each dead finding (analyse.ts:422).
- member-links.ts:288 walks every file twice more by name.

**Accretion and comment rot**
- `Builder.#file` runs about 20 passes (build.ts:363-397).
- Orphaned or misplaced comments: sites.ts:753, 918, 1614, 2060-2062; roles.ts:205; a doubled TSDoc at analyse.ts:218-219.

**No direct test:** pprof.ts and the `GraphQueries` internals. why, dump, state, declared and member-links are reached only through verb-level tests.

### Unions and value flow (union-slots, flows, unions, values, slots, variants, variance, constraints, shapes, ...)

**Toward false positives**
- An unreadable slot (`null` origins) credits nothing, so every "cannot trace" case reports the member unbuilt (unions.ts:225-228). This is deliberate and documented.
- Past `SPELLING_LIMIT` (2000), the slot becomes unreadable (union-slots.ts:2288).

**Toward false negatives**
- `sameValueReads` matches the switched value by `getText()`, so shadowing misleads it (union-slots.ts:2495-2512).
- `returnedType` matches `Promise` by text, with no lib check (union-slots.ts:743).
- shapes.ts:296-297 `linked` builds an unescaped `RegExp` from declaration text, so a `$` in a name breaks it.

**Library special cases**
- `KEY_FILTERS` is matched by text only (union-slots.ts:2634).
- slots.ts:80 relies on zod's internal `_input`.
- `ZOD_OUTPUT_VALUES` is matched by name (flows.ts:145).
- variants.ts:204-209 copies tailwind-variants' `false`-arm logic from its dist.
- TanStack `PAGE_CURSOR` (slots.ts:169).
- `PER_VERB_HOMES` uses path and name regexes (shapes.ts:91-94).
- spellings.ts:23-27 matches repo paths and the keys `path`, `name`, `owner` and `op`.

**union-slots.ts structure:** three property readers (`writtenPath` :2067, `propertySpellings` :785, `typeSpellings` :374), three binding models, five depth constants, and its own symbol lookup that bypasses both resolvers.

**More duplicates**
- union-slots.ts:2617 `unparenthesized` repeats resolve.ts:191 `unparenType`.
- native.ts:688 `constituents` repeats resolve.ts:1274 `constituentsOf`.
- `eachProductionNode` and `lineOf` exist in both unions.ts and shapes.ts.
- union-slots.ts `keyOf` and `propertyName` repeat resolve.ts `keyText`.

**Wrong comments**
- unions.ts:147 says `limits` is "always empty", but :841 returns `UNION_LIMITS`.
- lost.ts:66 says "every member", but the code returns any string-literal members.

**Performance and fragile keys**
- `nodeAt` walks the whole file on every `declarationAt` (union-slots.ts:222).
- union-slots.ts:1338 rescans the file for every constant.
- flows.ts keys sites by `node.pos`, which an expression shares with its leftmost child.

**No direct test:** patterns.ts, spellings.ts, variance cycles, and constraints' `checkedPatterns`.

### Trial, keys and judging (trial, trial-ledger, judge, keys, removed-keys, held, params, optional-pairs, census, worlds-check, key-resolver)

- **"Confirmed" means only that the compiler is happy after the delete.** No tests run. A value that crosses JSON into an unrelated hand-written type gets `confirmed`. `blind` fires only on mutual assignability (trial.ts:1156-1176). run.ts:945 admits the refuted counts are undercounted.
- **Joint deadness is unflagged.** A candidate read only inside another candidate's deleted body comes out `confirmed` with no flag (trial.ts:739-741).
- **Quiet fallbacks:** the line number falls back to `0+1` (trial.ts:706), and a missing find-references entry is treated as "no reads" (trial.ts:1428).
- **Name matches:**
  - held.ts:629-640: `map`, `filter`, `find`, `get`
  - key-resolver.ts:324: `FORM_WRITES` by method text
  - judge.ts:284: zod `"shape"`
  - optional-pairs.ts:589: `getText()` equality
  - optional-pairs.ts:609: a lowercase-tag regex
  - params.ts:644-655: `relaysOwnName`
- **Hardcoded paths:**
  - `CONTRACT_PATHS` and `RECEIVER_PATHS` (removed-keys.ts:76-86)
  - `PARAMS_HOMES` (params.ts:148)
  - `TEST_SOURCE` (optional-pairs.ts:159)
  - the `packages/` regexes (worlds-check.ts:190-191)
- **Bypasses of the key resolver:**
  - keys.ts `#namedAtAnyDepth` (:274) and `propsOnSlot`
  - params.ts:474-480 `setsProp`
  - optional-pairs.ts:376 and :445, raw `getPropertyOfType`
  - trial.ts:864 `propertiesNamed`
- **More copies:** `isFunctionLike` again in held.ts:120. params.ts imports `unwrapValue` and still writes its own loop. `memberHome` means different things in params.ts and analyse.ts.
- **Dead code and comment rot:** the `Trials.snapshots` getter has no reader (trial.ts:659); an orphan doc comment (worlds-check.ts:85); a misplaced comment (key-resolver.ts:549-551).

### Wire surfaces (procedures, routes, urls, codes, message-doors, columns, drizzle-rows, dom, css, selectors, open-sends, literal-hits)

**Live code that reads as dead (false positives)**
- A procedure reached by a computed key or a lost proxy read counts as uncalled (procedures.ts:123-125).
- A URL held in a Map or array, or passed through a function value, leaves its route uncalled (procedures.ts:126, 541).
- Hono `app.route()` and `basePath` are not modelled (`HONO_VERBS`, procedures.ts:67-76). This is safe only while the server has one `new Hono` (packages/server/src/entry/app.ts:285).
- A URL builder's method is unknown, so its call matches every method of the routes its URL fits (procedures.ts:129).
- dom.ts:397-409 counts a class as written only when a product string carries it as a token. A `"btn-" + size` concatenation, or a quoted `clsx({ "is-open": x })` key (`isKey`, dom.ts:806-813), would read as unwritten. This is latent while the tree uses `tv()`.

**Inconsistent library detection:** codes.ts finds tRPC and Hono by path substring (codes.ts:86-89, 763-764). Its siblings use `world.packageOf` (urls.ts:894).

**DOM and CSS are mostly regex with a checker garnish** (selectors.ts:17-19, dom.ts:153-161, css.ts:51-57). The "sees what no tool sees" claim holds for procedures, routes, columns and codes. It is overstated for DOM and CSS.

**Hardcoded paths:** procedures.ts:56, 85-119; codes.ts:78-82; css.ts:45-50; dom.ts:164-167; drizzle-rows.ts:40; literal-hits.ts:53, 589. Per-library tables: pino (open-sends.ts:136), `ai` and `@ai-sdk` `doStream` and `doGenerate` (open-sends.ts:156, 170).

**Own name matching:** literal-hits `slotMembers` (897-910) and `ownedHits` (848-851); message-doors `readNames` (688-693). `keyedWrites` (open-sends.ts:1844) has the same name-text problem as `usesOf`.

**More copies:** `walkFiles` (urls.ts:397) and `walk` (codes.ts:210).

**Performance**
- `nameAt` walks the whole file for every caller site (procedures.ts:424-436).
- `readsReach` runs find-references for every hop (urls.ts:807-830).
- `dependencySpelled` reads every JS file of every direct dependency (dom.ts:884-945).

**Orphan TSDoc:** urls.ts:860.

**Thin tests:** urls.ts (1,055 lines) and selectors.ts have no test of their own; routes.ts has one case and css.ts three.

### Top-level modules (run, native, port-*, coverage*, deliberate, judged*, field-sort, worlds, ...)

**Coverage**
- coverage-convert.ts:517 and :553 use `Object.assign`, so a later chunk mapping to the same source overwrites an earlier one. This is the same family as the coverage.ts:415 bug.
- `BARE_RUNNER_TEST` is a regex (coverage.ts:397).
- `coverage` writes with `resolve(root, out)`, while every other verb uses `checkoutOf`.

**Unenforced lists**
- **The excuses-nothing check almost never runs.** `excusedNothing` (deliberate.ts:691-707) needs all 9 consumer reports from one root, so in practice it returns `unjudged`.
- **Stale rows pass.** `deliberate-stale` exits 0 with stale rows (run.ts:314), and the judged-list check reports but never fails (run.ts:731, 1038).
- **The distinct registry is checked only for existence.** distinct-lookalikes.repo.int.test.ts never checks that an entry still excuses a look-alike. The file holds about 297 product paths in 75 entries.

**Name matches**
- list-methods.ts:1170-1196 picks array methods by name, with no receiver type check.
- port-census.ts:471 matches `Pick` by text.
- field-sort.ts:36, 101 is a regex over `git log -p`, and it feeds the `--verdict` filter.

**Hardcoded repo knowledge**
- `CONCEPTS` name lists, `now`/`rng`/`item`/`objective` (port-targets.ts:535-546).
- `NESTED_READS` is one file (boundaries.ts:589).
- worlds.ts:375 and :415 hardcode the source bridge and the worlds kept out of the merge.
- worlds.ts:537 treats production as only `packages/*/src`.

**Duplicates of other tools**
- doors.ts `ImportGraph.reaches` repeats dependency-cruiser's `no-circular`.
- port-targets.ts:648-706 re-implements part of dependency-cruiser's rule matching, and `isEdgeRule` drops any rule it can't model.

**run.ts**
- Five argument parsers (`parseArgs`, `parseGraphArgs`, `parseTrialArgs`, and the coverage and hits parsers) behind an ordered `asyncVerb` chain.
- `runScan` and `runGraphCodes` print and summarise in near-identical code (757-771 vs 1031-1047).
- The `graph` and `scan` verbs both emit member rows.

**Stale or misnamed**
- The run.ts header omits `deliberate-stale` and the four query verbs; the index.ts header omits every graph verb.
- native.ts:703 is an orphan doc comment; the comment at port-census.ts:511 is misplaced.
- handoffs.ts holds zod-parse reads; classify.ts holds Site and SyntaxRole.
- worlds.ts:278 claims no second compiler loads, which deliberate.ts makes false.

**No direct test:** judged.ts, judged-fields.ts, forgotten-exports.ts, doors.ts, handoffs.ts, list-methods.ts, classify.ts and cli.ts. field-sort.ts is reached only through graph-trial.

## Appendix: history numbers

- **Window:** commits from 2026-11-14 to 2026-11-27, about 1,950 in all; 1,215 after dropping `docs` and `chore(work)`.
- **Types:** 720 chore, 637 fix, 263 feat, 161 test, 91 docs, 76 refactor.
- **Top scopes outside docs and the board:** unwired 269, chat 173, inference 84, client 80, ui 67, import 44, contracts 42, db 36.
- **Fixes:** unwired 163, chat 99, ui 50, client 40, inference 28.
- **Features:** unwired 73, chat 44, db 24, inference 18, regex 17.
- **unwired:** about 360 commits touched `tooling/src/unwired`, 140 of them on 2026-11-23.
- **Bodyless or near-bodyless commits worth a body:** the revert `5862fe76` and the WIP `b4989289`.
