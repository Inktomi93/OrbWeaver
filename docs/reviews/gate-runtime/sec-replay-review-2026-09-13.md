---
kind: review
status: active
updated: 2026-09-13
---

# cb-sec-replay-review — independent security review of the §4.6 legacy-replay stack (#2319)

**Lane:** `cb-sec-replay-review`, worktree `.claude/worktrees/agent-a13698d31025df93a`. I wrote none of the
code under review. The five commits `df2cda4c8 · 95609264d · b0aedefba · 57349c1dc · 6144f3183` were
cherry-picked onto my worktree from `wt/agent-a2913d5f5cb4656c2` (`git cherry-pick df2cda4c8 95609264d
b0aedefba 57349c1dc 6144f3183`, all clean); `git diff 6144f3183 HEAD` touches no reviewed path — the delta is
only main-side commits that landed after the branch base `204607e84`, so the bytes I drove are the released
bytes.

**Verdict: INTEGRABLE with three new rows filed.** Both boundaries codex held `df2cda4c8` for are CLOSED and
I reproduced the closure by driving the real entrypoints, not the helpers. The write-site census is exact.
The containment argument survives every abuse path I could construct, including three the committed suite
does not cover (a two-hop symlink chain, a symlink in a deep parent segment, and a symlink planted at the
loader's own staged filename — the last one driven through the MUTATOR with the victim file's bytes proven
unchanged). What I found on top is one MEDIUM latent defect in `shimHeaderImports` that falsifies the
module's own founding safety claim, two LOW legibility/posture rows, and one out-of-stack finding: the
PRODUCTION conformance runners this harness mirrors still carry the exact F1 shape the harness just repaired.

---

## Verdicts, item by item

### 1. Fixture keys validated before any write and before the mkdtemp — **CONFIRMED (driven)**

`materialize` (`tests/support/legacy-differential.ts:767-802`) walks every key through
`assertStagedRelativePath` (`:361`) **before** `mkdtempSync` (`:784`). The grammar is IMPORTED, not
re-spelled: `assertPolicyRepoPath` from `tooling/src/verify/lib/policy-repo-inventory.ts:39` (imported at
`:69`), which rejects non-string, empty, untrimmed, ASCII-control, leading `/`, `X:/`, trailing `/`,
backslash, and any empty / `.` / `..` segment. The non-authored vocabulary survives as a SEPARATE semantic
fence (`NON_AUTHORED_SEGMENT_RE`, `:608`, applied at `:776`) — neither refusal implies the other.

Driven (probe `cbsrr item5b`, `CBSRR-ITEM5B`): all four non-authored spellings refuse
(`node_modules/x.ts`, `.git/config`, `dist/x.ts`, `.cache/x.ts`), and `orb-legacy-differential-<pid>-*`
count in `os.tmpdir()` is **0** before and after — the refusal precedes the `mkdtemp`, so there is nothing to
leak. The eleven traversal spellings are pinned by the committed control
(`grant-liveness-legacy-replay.test.ts:546-573`) which also asserts `readdirSync(root)` is `[]` after all
eleven, and by the two-leg sentinel arm at `:592-616`. Both green in my run.

Gap, not a defect: the non-authored fence has **no committed control** (grep over the three replay tests for
`node_modules` / "non-authored": 0 hits). I drove it; nothing pins it.

### 2. The canonical-root guard is bound at staging AND at `import()` — **CONFIRMED (driven), with one PARTIAL**

Bound at three places: `loadFrozenGate`'s head (`:540`, before `git show`), inside `stagedReplayTarget`
(`:415`) which every staged write goes through, and `materialize` (`:785`) on the door's own root. A fourth
check — `containedIn(realpathSync(scratch), entryFile)` at `:552` — re-states containment at the one call
that hands frozen bytes to the runtime.

Codex's bar was discrimination through the real entrypoint, not ENOTDIR. Driven through
`frozenFilesystemLegacyGate(<root>, "c97de9d2f", "tooling/src/verify/gates/biome-grant-liveness.ts")`:

| root kind | refused before any write? | which refusal | bytes on disk |
| - | - | - | - |
| VALID owned dir outside the checkout (`/tmp/cbsrr-*/valid-root`) | n/a — **PROCEEDED** | — | 12 staged files, all flat names, all inside the root |
| dir INSIDE the checkout (`<cwd>/tooling`) | **YES** | `must live OUTSIDE the running checkout` | none — `<cwd>/tooling/<stagedEntry>` absent |
| regular FILE inside the checkout (`<cwd>/package.json`) | **YES** | same named refusal | none |
| symlink → the checkout root | **YES** | same named refusal (realpath'd) | none |
| symlink → a dir inside the checkout | **YES** | same named refusal (realpath'd) | none |
| regular FILE **outside** the checkout | **YES, but only incidentally** | raw `ENOTDIR: … lstat '<file>/c97de9d2--…ts'` | none |
| nonexistent path | **YES** | raw `ENOENT` from `realpathSync` inside the guard | none |
| DANGLING symlink | **YES** | raw `ENOENT` (stat) | none |
| the door's OWN mkdtemp root with `TMPDIR` relocated INSIDE the checkout | **YES** | named refusal, **and the root was reaped** | residue under `<cwd>/.cbsrr-tmpdir` = `[]` |

`existsSync(join(process.cwd(), "c97de9d2--tooling__src__verify__gates__biome-grant-liveness.ts"))` is
`false` after all eight arms, and so is the `tooling/` sibling.

**PARTIAL — `assertReplayRootIsScratch` has no directory test.** Driven directly (`CBSRR-ITEM2B`): a regular
file outside the checkout is **ACCEPTED** by the identity guard; the refusal arrives one call later as a bare
`ENOTDIR` out of `containedSegment`'s `lstat` rethrow (`:377-386`). No containment breach — nothing is
written on any arm — but the door's own advertised refusal does not name that boundary, which is exactly the
"ENOTDIR is not proof the guard holds" shape codex flagged. The importable rule already exists:
`policy-repo-inventory.ts:56-62` (`rootDirectory`) makes the `statSync(canonical).isDirectory()` test.
Filed as **LD-2319-10**.

### 3. Every write destination goes through one site — **CONFIRMED (two methods, 1 file scanned)**

Scanned: `tests/support/legacy-differential.ts` (1090 lines), the whole module. Method A:
`/usr/bin/grep -nE` over 14 mutating spellings. Method B: `ast-grep run -p '<primitive>($$$)' -l ts` per
primitive, 11 patterns, run individually. Both agree:

| primitive | count | sites |
| - | -: | - |
| `writeFileSync` | 1 | `:439` — inside `writeStagedReplayFile` |
| `mkdirSync` | 1 | `:438` — same function, on `dirname(target)` after the target is contained |
| `mkdtempSync` | 1 | `:784` — `materialize`, `join(tmpdir(), "orb-legacy-differential-<pid>-")` |
| `rmSync` | 3 | `:799` (materialize's partial reap) · `:864`, `:931` (the two legs' `finally`) |
| `symlinkSync` · `renameSync` · `copyFileSync` · `appendFileSync` · `createWriteStream` · `cpSync` · `openSync` · `truncateSync` · `chmodSync` · `utimesSync` · `Project.save()` | 0 | — |

**One indirect write destination is NOT through the site, and it is contained:** `initRepository` (`:804-819`)
runs `git init --quiet` and `git add --all` through `runNicedSync` with `cwd: root`, which materializes
`.git/` inside the root. `initRepository` is module-private and both callers pass `materialize`'s own
mkdtemp root (`:829`, `:869`), so no caller-supplied path reaches it; it strips `GIT_*` via
`repoGitEnvironment()` and passes `-c core.hooksPath=/dev/null`. I record it so the "exactly one write site"
claim is read as "exactly one *file* write site", which is what it is.

Three `execFileSync("git", ["show", …])` calls (`:446`, `:543`, `:565`) are reads — but see **LD-2319-9**.

### 4. Symlink containment — **CONFIRMED (driven, including three arms the suite does not cover)**

`stagedReplayTarget` (`:414-433`) walks every segment from the canonical root, `lstat`s each existing one,
`realpathSync`es a symlink and re-contains it (`containedSegment`, `:377-411`), then applies an INDEPENDENT
`containedIn` test on the computed target (`:425-431`). Dangling links refuse with their own sentence.

Driven (`CBSRR-ITEM4`), in a reviewer-owned `/tmp/cbsrr-*` parent:

| arm | verdict |
| - | - |
| two-hop chain OUT (`hop1 → hop2 → outside`) | **REFUSED** — `the staging path crosses the symlink …/root/hop1` |
| two-hop chain IN (`in1 → in2 → root/real`) | **RESOLVED** to `…/root/real/planted.ts` — safe alias, re-contained |
| link in a DEEP parent segment (`real/deep/escape/…`) | **REFUSED** |
| plain contained path | **RESOLVED** — the positive control |
| **FINAL segment, through the MUTATOR**: a symlink planted at the loader's exact staged filename, pointing at `outside/victim.ts`, then `frozenFilesystemLegacyGate(scratch, …)` | **REFUSED** — `the staging path crosses the symlink …`; `victim.ts` bytes unchanged (`VICTIM-BYTES`) |

That last arm is the one that matters most and the committed suite does not have it: it is the only path on
which `writeFileSync` would actually have followed a link, and it is now measured rather than argued. The
committed suite's symlink table (`grant-liveness-legacy-replay.test.ts:576-600`) drives the PURE resolver
only.

`mkdirSync` building behind a link is closed by construction: `dirname(target)` is computed from the
already-canonicalized target, so every component it creates sits under a contained parent.

### 5. Cleanup on every failure path — **CONFIRMED (driven, including the hard clause)**

- **Refusal before the mkdtemp leaves nothing:** driven, replay-root count 0 → 0 across both legs and all
  four non-authored arms (`CBSRR-ITEM5B`, `CBSRR-ITEM5`).
- **A throw BETWEEN the mkdtemp and the last write reaps the partial root:** driven for real, not by reading
  the `catch`. Fixture map `{ "a": "…", "a/b.ts": "…" }` sorts `a` first, writes it as a FILE, then walks
  INTO it for `a/b.ts` → `ENOTDIR` **after the first byte has landed**. Result:
  `partial materialize :: THREW ENOTDIR … '/tmp/orb-legacy-differential-1733755-9QRDmZ/a/b.ts'`,
  `replay roots before=0 after=0` — `materialize`'s own `catch` (`:796-800`) reaped it.
- **No `finally` depends on a root the throwing function never returned:** `const { root, project } =
  materialize(files)` sits OUTSIDE the `try` in both legs (`:829`, `:869`), so the `finally` at `:864`/`:931`
  cannot run on an unreturned root. Confirmed by source; the driven receipt above is what proves the reap is
  actually owned by `materialize`.
- **Residue:** `find` over my probe parents after every control — zero. `git status --short` in my worktree
  is EMPTY after removing both probe modules.

The loader (`loadFrozenGate`) does NOT reap on a mid-closure throw — by design: `scratch` is caller-owned
and the callers pass Vitest's `scratch` fixture (`tests/support/tool-fixtures.ts:56-60`), an `mkdtemp` dir
`rm -rf`'d after use. A partial closure therefore dies with the fixture. Correct, and worth stating because
it is the one cleanup this module deliberately does not own.

### 6. The frozen relative-dependency closure — **CONFIRMED (driven across the whole replayed corpus)**

Only `./` and `../` are era-matched (`resolveWith`, `:185-200`); `node:*` returns `null` and is carried
verbatim; `@orb/tooling/_shared/*` and bare packages keep TODAY's resolution through `REQUIRE`. That is
load-bearing exactly as the header states: `ts-morph` must be the SAME instance the harness holds or the two
engines carry different `SyntaxKind` identities and every comparison in the tables becomes noise. Relative
specifiers resolve against the IMPORTING module's own repo directory (`normalizeRepoPath`, `:513-515`).

Driven `frozenClosureOf` over **all 22 frozen (base, path) pairs** the seven suites load (`CBSRR-ITEM6`):
every one extracts; `files == extracted` on every row (no orphan write); **`nested=false` on all 22**, so the
flat `${base.slice(0,8)}--${path→__}` name provably creates no directory across the real corpus; max depth 4;
`revisited` non-empty on 15 of 22, so DIAMONDS are measured, not assumed.

**Cycles: driven.** I built a dangling commit with `hash-object`/`mktree`/`commit-tree`
(`3e00b0ae18a354fdbbee8de28f707bf24f062290`, unreferenced by anything in the repo) holding two flat modules
that import each other relatively. `frozenClosureOf` terminates:
`extracted=[cbsrr-cyc-a.ts,cbsrr-cyc-b.ts] depth=1 revisited=[cbsrr-cyc-a.ts]`, two files written. The
memoise-before-recurse ordering at `:503-505` is what does it, and the target is resolved through
`stagedReplayTarget` BEFORE the map records it (`:501`) so a cycle can never be answered with an uncontained
path.

Absent-dep refusal: the committed control (`registry-definitions-legacy-replay.test.ts:104-110`) is green in
my run, and the message names both paths. Closure writes all route through `writeStagedReplayFile` (`:508`).

INFO, no row: `frozenBlob` (`:444-450`) swallows **every** `git show` failure into `null`, so a `maxBuffer`
overflow (>8 MiB blob) or a repository error is reported as *"does not exist at that SHA either — so this is
a wrong base or a wrong path"*, a claim the code cannot support. It also drops stderr
(`stdio: ["ignore","pipe","ignore"]`).

### 7. Same-fixture legacy/final semantics, and the shim fence — **PARTIAL (one MEDIUM defect)**

Same bytes: `runScenarios` (`:938-...`) hands the SAME `files` object to `legacyReplay` and `finalReplay`
per row. Driven (`CBSRR-ITEM7B`): the map is byte-identical after both legs — neither engine mutates it.
Per-scenario fresh roots are deliberate and correctly reasoned (`:826-827`: a legacy `existsSync` oracle and
a `git add --all` index are whole-root state). I did NOT conflate this with P7's baseline/grant reuse — see
the coupling note.

**The line-anchored shim does NOT hold as a class, and its own proof is vacuous where it fails.**

`IMPORT_BLOCK_OPEN = /^(?:import|export)\s[^"]*\{\s*$/u` (`:204`) is meant to recognise a wrapped named
import. It also matches `export const gate: GateDescriptor = {`, `export function f(a: string) {`,
`export interface X {` and `export type T = {`. The first such line after the imports puts the scanner in
block mode, and it stays there for the rest of the module hunting a `^} from "…";$`. Two consequences:

1. The body byte-identity assertion (`:265`) becomes **vacuous** over everything swallowed — when the scan
   reaches EOF, `body === ""` and `expect(out.slice(out.length - 0)).toBe("")` passes trivially.
2. Any column-0 `} from "…";` in the swallowed region — **including inside an authored fixture template
   literal** — is rewritten to an absolute `file:///` URL. That is precisely the failure this module's header
   says the line-anchored shim exists to prevent ("*A blanket `String.replace` also patches the module's
   embedded FIXTURE STRINGS … and then BOTH engines judge a broken specifier and report a matching pair of
   WRONG numbers, which a count comparison structurally cannot detect*").

**Driven planted control** (`CBSRR-ITEM7-CONTROL`), a synthetic gate module whose fixture string carries a
wrapped import:

```
10: } from "./authored-fixture-specifier";
 ==> } from "file:///…/tooling/src/verify/gates/authored-fixture-specifier";
```

The rewrite happened, the body-identity assertion did not fire, and `shimHeaderImports` returned normally.

**Reachability, measured.** Today's corpus is clean: across the 22 frozen blobs the seven suites actually
load, every rewritten line is inside the header import block and `extraTail=0` on all 22
(`CBSRR-ITEM7-BLOBS`) — so **no current table is corrupted**. A faithful screen of the scanner over
`tooling/src/verify/gates/*.ts` (309 files scanned) finds **2** modules that already enter block mode
(`no-blanket-suppression.ts:60`, `no-decorators.ts:26`) with 0 rewrites, and the two not-yet-loaded family-3
SPLIT legacy blobs (`config-group-completeness@dd862e988`, `section-registry-completeness@e18bce01e`) are
clean. The risk is forward-looking and the harness is about to be walked across ~133 more legacy examples.

Minimal fix: `const IMPORT_BLOCK_OPEN = /^(?:import|export)\s+(?:type\s+)?\{\s*$/u;` — that is the complete
set of real wrapped-import openers (`import {`, `import type {`, `export {`, `export type {`) — plus one
assertion that the header/body boundary never crosses the first non-header, non-import line, so the
byte-identity proof can never be vacuous again. Filed as **LD-2319-8**.

### 8. Reported replay coverage and row dispositions — **CONFIRMED for families 1 and 2, PARTIAL for family 3**

**Floor executed** (`pnpm test:scoped` on the seven importer suites, from my worktree): **7 files / 35 tests
passed**, exit 0 — the exact number §7.4 claims. Per file: `grant-liveness-legacy-replay` **8**,
`policy-soundness-legacy-replay` **3**, `registry-definitions-legacy-replay` **4**, `grant-liveness-family`
**6**, `schema-fact-parity` **9**, `port-parity-tier3` **3**, `no-color-literals-parity` **2**.

**Family 1 — 25 rows, tally re-derived by me from the executable rows:** 3 `identical` · 4
`vacuous-both-zero` · 4 `retired-arm` · 3 `split` · 3 `runtime-refusal` · 5 `stronger-reader` · 3
`exemption-mechanism-move` = **25**, and the runner asserts 14 + 11 against the live example count. This
matches §4b-bis exactly. The test header at `grant-liveness-legacy-replay.test.ts:45-49` still says "(7
rows)" for stronger-reader and "two exemption-HONOURED examples … (3 rows)" — **CONFIRMED WRONG, and I did
not touch it** (root's on integration, per §4b-bis). Note for the integrator: the two PRODUCTION module
headers `df2cda4c8` rewrote are CORRECT (biome 1+1+2+2+3+2+3 = 14, tsconfig 2+2+1+2+2+1+1 = 11, summing to
5 stronger and 3 category-5) — only the test file's header is stale, so the correction is one file.

**Family 2 — one conversion + nine born-final refusals: re-derived myself.**
`git log --format=%h -S "gate: GateDescriptor" -- <the nine paths>` → **0** lines; the positive control over
`diagnostic-legibility.ts` + `biome-grant-liveness.ts`, same query shape → **4** lines. The zero is an
absence, not a broken search. `rg --files-with-matches 'family: "policy-soundness"'` → **10** files, so nine
born-final is right.

**Family 3 — PARTIAL.** Membership reproduces: `rg --files-with-matches 'family: "registry-definitions"'` →
**9** files, and the two SPLIT members the report lists but the test excludes DID hold a legacy descriptor at
their stated bases (`git show dd862e988:…config-group-completeness.ts` and
`git show e18bce01e:…section-registry-completeness.ts` each contain `gate: GateDescriptor`) — so "nine of
nine are real conversions" reproduces. **But the withheld-by-population arm is driven over SEVEN of nine,
not nine**: `registry-definitions-legacy-replay.test.ts:47-55` declares `MEMBERS` as "the seven non-split
members" and excludes the two SPLIT ones by name. The brief's framing ("nine modules, all withheld") is the
imprecise part, not the report — §5c never claims nine withheld. The arm that IS driven reads exactly what it
claims: per module it asserts `after.toolErrors` equals `<policy>/receipt: zero-member population(s): <the
named denominators>` and `after.findings` is `[]`, with a TOTAL classifier that throws on any message not
containing `resolved zero members`. The legacy side is separately asserted un-refused, which is what stops
the zero being mis-filed as a retired arm.

**"Named source-ledger repairs are not acceptance"** — every FIXED row's mechanism was re-driven above
(§1–§6), not read off a sha.

### 9. `## LEDGER ROWS` (LD-2319-1..7) against the tree — **CONFIRMED, two rows UNDERSTATED**

None of the seven rows is in `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md` yet (grep: 0
`LD-2319` hits) — they are proposed rows the integrator transcribes, which matches how the report words 6
and 7.

| row | state cell | reproduces? |
| - | - | - |
| `LD-2319-1` | FIXED in `df2cda4c8` | **YES** — `git show df2cda4c8` adds `if (specifier.startsWith("node:")) return null;` |
| `LD-2319-2` | FIXED in `df2cda4c8` | **YES** — same commit adds `IMPORT_BLOCK_OPEN`/`IMPORT_BLOCK_CLOSE`. See LD-2319-8: the fix is right, the matcher it introduced is too loose |
| `LD-2319-3` | OPEN, `diagnostic-legibility.ts:31` | **YES, and UNDERSTATED** — the header is stale in TWO places, `:30` *"the nine-module `policy-soundness` family"* (tree: **10**) and `:31` *"the other eight"* (tree: **nine**). A "one-line header fix" fixes half of it |
| `LD-2319-4` | OPEN, MITIGATED | **YES, and UNDERSTATED** — 199 files match `POPULATION PORT`; only **6** carry the `POPULATION PORT: NONE` spelling the row cites, yet **all nine** born-final `policy-soundness` modules match the census key, three of them via `POPULATION PORT: NO legacy population`. Excluding the `: NONE` spelling would still over-count |
| `LD-2319-5` | FIXED at `57349c1dc` | **YES** — that commit adds `extractFrozenClosure`; the `section-defs.ts` and absent-dep controls are green in my run, and I re-drove cycles and diamonds independently |
| `LD-2319-6` | OPEN, repaired by `cb-x-replay-boundary`, four pins | **YES** — the four controls exist and pass; the pre-fix escape is not re-measurable from the released tree (the repair is in the same file) and I did not re-break it |
| `LD-2319-7` | OPEN, repaired, "a root that is a regular FILE ⇒ ENOTDIR, measured" | **YES for the repair, MISLEADING parenthetical** — on the UNBROKEN tree a regular file inside the checkout refuses with the NAMED root-identity refusal, not ENOTDIR (driven, §2). ENOTDIR is what the arm produces only under §7.2's planted break. Proposed state-cell text below |

### 10. Trust boundary — **CONFIRMED, with one place the harness reads bytes it did not pin**

Fixture keys, frozen SHAs and legacy paths are repository-authored data reviewed with the commit; this is
host integrity, not hostile input. I did not invent sandboxing for the imported frozen module: executing a
frozen `GateDescriptor` is executing repository-authored historical code, which is the whole point of the
door. Git is invoked with argv arrays through `execFileSync`/`runNicedSync` — no shell, no interpolation.
`initRepository` strips `GIT_*` and passes `core.hooksPath=/dev/null`, so no hook from a global
`init.templateDir` can execute in the replay root.

**The one gap in "would execute or write something it did not author":** the three
`execFileSync("git", ["show", …])` calls (`:446`, `:543`, `:565`) do NOT pass `env: repoGitEnvironment()` and
do not pin `cwd`, unlike `initRepository` at `:813` which does. The frozen read is therefore steerable by the
ambient environment — proven:

```
git show c97de9d2f:tooling/src/verify/gates/biome-grant-liveness.ts        → the blob
GIT_DIR=<other repo>/.git git show c97de9d2f:…biome-grant-liveness.ts      → fatal: invalid object name
```

Failure scenario: the instrument battery (`pnpm verify --full`, which is where `tests/tooling/**` lives)
executed from inside a git hook — git exports `GIT_DIR`/`GIT_INDEX_FILE` to hooks — resolves the frozen blob
against a different object store than `process.cwd()`, and the harness then WRITES that blob into scratch
and `import()`s it. The bytes executed would not be the bytes the SHA names in this repository. Low
likelihood, and the repo's own posture comment
(`tooling/src/verify/lib/repo-paths.ts:67`, *"Explicit repository roots must not inherit a caller's alternate
repository or index"*) already rules it. One-line fix, three call sites. Filed as **LD-2319-9**.

---

## Per-commit verdicts

| commit | verdict |
| - | - |
| `df2cda4c8` — family 1 + the three harness doors | **SOUND as superseded.** Its two production edits (`biome-grant-liveness.ts`, `tsconfig-entry-liveness.ts`) are comment-only and their per-module tallies are correct. Its two write boundaries were real and are closed by `6144f3183`; the `IMPORT_BLOCK_OPEN` matcher it introduced carries LD-2319-8 |
| `95609264d` — family 2 | **SOUND.** The harness change is a pure refactor extracting `differentialViolations`/`DifferentialSide`/`inMemorySide`; no write path touched. The born-final receipt reproduces with its positive control |
| `b0aedefba` — family-3 pre-check | **SOUND.** Report-only (1 file, +56 lines). Its membership and conversion claims reproduce |
| `57349c1dc` — durability checkpoint | **NOT INTEGRABLE STANDALONE, correctly superseded.** It added a SECOND unguarded `writeFileSync` (the closure extraction) while F1/F2 were still open, i.e. the tree at this sha is strictly worse than `df2cda4c8` on the boundary. Only meaningful as a parent of `6144f3183`; do not split the stack here |
| `6144f3183` — boundary repair | **SOUND, and it is the commit that makes the stack integrable.** One write site, imported grammar, two independent containment tests, guard bound at the loader head and re-stated before `import()`, partial materialize reaped. Every claim in its message that I could drive, I drove |

---

## LEDGER ROWS (3 rows)

Written in the LD-2319 series' grammar (the one `x-legacy-replay-2026-09-13.md` §LEDGER ROWS already uses)
so they drop into the section they extend. The refutation ledger's own body grammar is
`| module | wave · path:line | defect | class | state | receipt |`; map `what`→`defect`, `state`→`state`, and
take the receipt from the state cell.

| id | class | module | what | state |
| - | - | - | - | - |
| `LD-2319-8` | instrument-blind | `tests/support/legacy-differential.ts:204` | `IMPORT_BLOCK_OPEN` (`/^(?:import\|export)\s[^"]*\{\s*$/u`) recognises far more than a wrapped named import: `export const gate: GateDescriptor = {`, `export function f(a: string) {`, `export interface X {` and `export type T = {` all match. The first such line after the imports puts `shimHeaderImports` in block mode for the REST of the module, which (a) makes the body byte-identity assertion at `:265` VACUOUS over everything swallowed (`body === ""` ⇒ `expect(out.slice(out.length - 0)).toBe("")`) and (b) rewrites any column-0 `} from "…";` in the swallowed region — INCLUDING one inside an authored fixture template literal — into an absolute `file:///` URL. That is the exact "the harness corrupts both engines identically" failure this module's header claims the line-anchored shim prevents, and a count comparison structurally cannot see it. Driven: a planted synthetic module had its fixture-string line 10 rewritten while the assertion stayed green. | **OPEN** — latent, not live: all 22 frozen blobs the seven suites load are clean (`BEYOND-HEADER=[]`, `extraTail=0` on every one), and a scanner screen over `tooling/src/verify/gates/*.ts` (309 scanned) finds 2 modules already in block mode with 0 rewrites. Minimal fix: `/^(?:import\|export)\s+(?:type\s+)?\{\s*$/u` — the complete set of real openers — plus an assertion that the header/body boundary never crosses the first non-header non-import line, so the byte-identity proof cannot be vacuous. Owed BEFORE family 3's ~133-example walk |
| `LD-2319-9` | boundary-open | `tests/support/legacy-differential.ts:446,543,565` | The three `execFileSync("git", ["show", …])` frozen reads inherit the ambient `GIT_*` environment and pin no `cwd`, unlike `initRepository:813` which passes `repoGitEnvironment()`. The harness WRITES the result into scratch and `import()`s it, so the object store the executed bytes come from is caller-environment-steerable rather than pinned to `process.cwd()`. Proven: `GIT_DIR=<other repo>/.git git show c97de9d2f:…` returns `fatal: invalid object name` where the bare call returns the blob. Concrete failure: `pnpm verify --full` (the tier `tests/tooling/**` lives in) executed from inside a git hook, where git exports `GIT_DIR`/`GIT_INDEX_FILE`. Violates the posture `tooling/src/verify/lib/repo-paths.ts:67` states for exactly this reason. | **OPEN** — no live instance; nothing in the current suites sets `GIT_*`. Minimal fix: `{ …, cwd: process.cwd(), env: repoGitEnvironment() }` on all three call sites; `repoGitEnvironment` is already imported at `:66` |
| `LD-2319-10` | instrument-blind | `tests/support/legacy-differential.ts:346,377` | `assertReplayRootIsScratch` decides root IDENTITY (outside the checkout, realpath'd) but never that the root IS A DIRECTORY, so a regular file outside the checkout is ACCEPTED by the guard (driven: `ACCEPTED (no directory check)`); the refusal then arrives one call later as a bare `ENOTDIR` rethrown raw from `containedSegment`'s `lstat` (`:381-386` re-raises every non-`ENOENT` code). Same for a fixture map whose keys collide as file/dir (`{ "a": …, "a/b.ts": … }`), which refuses mid-materialize with a bare `ENOTDIR`. No containment breach — driven, zero bytes and zero surviving roots on every arm — but codex's own bar is that ENOTDIR is not proof the root-identity guard holds, and these refusals do not name the boundary they are protecting. | **OPEN** — cosmetic-severity, boundary-legibility. Minimal fix: add `statSync(canonical).isDirectory()` to `assertReplayRootIsScratch` (the test `policy-repo-inventory.ts:56-62` `rootDirectory` already makes — import it rather than re-spell), and wrap the non-`ENOENT` `lstat` rethrow in `containedSegment` with the door's own sentence |

**ledger rows OWED: 0** for the stack under review beyond these three.

### Existing LD-2319-x rows — proposed state-cell text (integrator's edit, not mine)

- **`LD-2319-3`** — append to the `what` cell: *"and the same header is stale twice: `:30` says 'the
  nine-module `policy-soundness` family' where `rg 'family: \"policy-soundness\"'` returns TEN files. The
  routed fix is two numbers on two adjacent lines, not one."*
- **`LD-2319-4`** — append to the `what` cell: *"and the row understates its own mechanism: only 6 of the 199
  matching files carry the `POPULATION PORT: NONE` spelling, while all NINE born-final `policy-soundness`
  modules match the census key — three of them through `POPULATION PORT: NO legacy population`. An exclusion
  keyed on `: NONE` would still over-count."*
- **`LD-2319-7`** — replace the parenthetical *"(a root that is a regular FILE ⇒ ENOTDIR, measured)"* with:
  *"(pinned by a mutator arm whose red side is structurally unwriteable: on the repaired tree a regular file
  inside the checkout refuses with the NAMED root-identity refusal before any byte, and it is only under
  §7.2's planted break that the same arm falls through to ENOTDIR — which is what proves the arm reaches the
  real staging write)."*

### One OUT-OF-STACK finding, routed rather than filed against this branch

**The PRODUCTION conformance runners this harness mirrors still carry F1 verbatim.** `runResourceExample`
(`tooling/src/verify/ops/policy-conformance.ts:129-136`) and `runFsBackedExample`
(`tooling/src/verify/ops/conformance.ts:124-131`) both do `join(root, path)` → `mkdirSync(dirname)` →
`writeFileSync` over `proof.files` / `exampleFiles(...)` keys with **no path grammar at all** — the exact
shape codex rated HIGH host-integrity in `materialize`, on the same repository-authored trust boundary, in
the runner the harness was written to mirror. `assertPolicyRepoPath` is applied at eleven sites across
`tooling/src/verify/**` and at **none** of the conformance file-key loops. A syntactically valid future
`GateExample`/`GatePolicyProof` key of `"../escaped.txt"` writes outside the mkdtemp root and survives the
`finally` reap, identically. I did not enumerate today's proof keys, so I make no claim that a live escape
exists — the boundary is open regardless, which is the ruling codex already made for the harness.

Minimal fix, and it is narrow: run `Object.keys(proof.files)` (and the `links` KEYS) through
`assertPolicyRepoPath` before the mkdtemp. **Do NOT validate `links` TARGETS** — `tooling-instrument-proof.ts:419`
and `runner-config-path-liveness.ts:409` deliberately plant `"../../.."` targets as the SUBJECT of an escape-detection
arm, and nothing writes through a link there (the file loop completes before the link loop).

This is routed to the orchestrator rather than filed as an LD-2319 row because it is not this branch's code —
and it is time-sensitive: codex's Astra lane is reshaping `runResourceExample` right now, so the shared
materialization it is building is where the grammar belongs, once.

---

## Coupling notes (not findings)

- **Astra's P7 reshape.** The harness MIRRORS `runResourceExample`'s substrate but keeps a fresh root per
  scenario on purpose (`:826-827`) — a legacy `existsSync` oracle and a `git add --all` index are whole-root
  state, so a shared root would leak the previous fixture into the next verdict. That is a different
  requirement from P7's baseline/grant reuse (where the SAME tree must be seen twice), and I am not proposing
  any signature change to the mirror. The one place a shared-materialization adapter would break the mirror:
  `createTmpdirDifferential`'s legacy leg re-runs `legacyReplay(..., { index: false })` per row
  (`:952-953`) as the substrate-port control. That control needs a root materialized WITHOUT `git add`, so
  an adapter that hard-wires "init + add" into one shared materialization removes the only thing proving the
  index is inert on the legacy side. If the adapter lands, `index: boolean` has to survive as a parameter.
- **Three copies of `NON_AUTHORED_SEGMENT_RE`** (`ops/policy-conformance.ts:37`,
  `tests/support/legacy-differential.ts:608`, `tests/tooling/verify/gates/css-hook-provenance-family.test.ts:201`).
  The repair honored "the grammar is IMPORTED, never re-spelled" for the traversal rule and not for this one.
  One-home nit, no security weight; worth folding when the conformance fix above lands.
- **`grant-liveness-legacy-replay.test.ts:606`** writes its sentinel directly into `os.tmpdir()` (not into
  `scratch`) — deliberate and correct, since `../<name>` from the door's own mkdtemp root must land there —
  but it is the one file in this stack that outlives a SIGKILL mid-test. Pid-unique and `rmSync`'d in
  `finally`; noted, not filed.

## What I did NOT cover

- I did not re-break the repair to re-measure the pre-fix escape (§7.2's red-first is the author's; the
  released tree cannot express F1 any more, and re-breaking a shared file to re-witness a closed defect is
  not worth the blast radius).
- I did not re-adjudicate the 25 rows' SEMANTICS — which finding is really a split versus a retired arm is
  the family-1 semantic review's call, already made. I verified the tally, the runner's assertions and that
  every row's label is checked by `differentialViolations`, not the correctness of each disposition.
- I did not run any whole-tree battery, `pnpm check`, `check:policy-conformance`, or any mutation run.
- I did not drive family 3's two SPLIT members through the replay (they are out of the committed chunk), and
  I did not enumerate the ~133 legacy examples the family-3 backlog names.
- I did not review the report's §3/§3a census arithmetic beyond the two numbers LD-2319-4 turns on.
- I did not review `docs/catalog/**` or any doc-catalog consequence of the new report file.

## Floor executed (this review)

| check | command | result |
| - | - | - |
| the seven importer suites, on the cherry-picked stack | `pnpm test:scoped` × 7 paths, from my worktree | **7 files / 35 tests passed**, exit 0 |
| reviewer probe module 1 (items 2, 4, 5, 6, 7) | `pnpm test:scoped tests/tooling/verify/gates/cbsrr-probe-1.test.ts` | exit 0, 7 tests; module deleted afterwards |
| reviewer probe module 2 (items 5, 6, 7, and the TMPDIR arm) | `pnpm test:scoped tests/tooling/verify/gates/cbsrr-probe-2.test.ts` | exit 0, 4 tests; module deleted afterwards |
| write-site census | `/usr/bin/grep -nE` + `ast-grep run -p '<primitive>($$$)' -l ts`, 1 file scanned, 11 + 14 patterns | agree exactly |
| shim reachability screen | a faithful replica of the scanner over `tooling/src/verify/gates/*.ts` | **309 files scanned**, 2 in block mode, 0 rewrites |
| docs | `pnpm check:docs docs/reviews/gate-runtime/sec-replay-review-2026-09-13.md` | exit 0 |

`git status --short` EMPTY after both probe modules were removed. Both probes ran only in reviewer-owned
`/tmp/cbsrr-*` parents (`rmSync` in `finally`) plus one `<cwd>/.cbsrr-tmpdir` directory created and removed
by the TMPDIR arm; nothing was written to the released worktree, to `main`, to the refutation ledger, to the
catalog or to the board.

## Commit

This review is ONE commit on `wt/agent-a13698d31025df93a`, touching exactly one file:

```
docs/reviews/gate-runtime/sec-replay-review-2026-09-13.md
```

The five commits under review were cherry-picked into this worktree to drive them and are NOT this lane's
work; nothing on the released branch `wt/agent-a2913d5f5cb4656c2` was modified. The cycle fixture cited in
§6 is a dangling commit object (`3e00b0ae18a354fdbbee8de28f707bf24f062290`) created with
`hash-object`/`mktree`/`commit-tree`; it is unreferenced and will be pruned by any `git gc`, which is
correct — it is a receipt of a run, not a durable artifact.

---

## Recheck (7d2d2c502) — 2026-09-13

The security owner repaired all three rows on top of `6144f3183`. Applied here by
`git cherry-pick 7d2d2c502` (clean); the diff between `7d2d2c502` and my HEAD over the four touched paths is
EMPTY, so the bytes I drove are the released bytes. Everything below is read-only against my own worktree.

**Verdict for the six-commit stack: INTEGRABLE.** All three rows are repaired at the root cause, not at the
symptom, and the repair is materially better than the fix I suggested. One sub-item is REFUTED (§R6b, an
avoidable lint suppression), and one of my own claims is REFUTED BY THE AUTHOR — I concede it, and my own
census makes their correction an order of magnitude larger than they measured.

### R1 — LD-2319-8, the header/body boundary — **CONFIRMED**

**The opener is the exact grammar.** Driven line by line through the real `shimHeaderImports` (a candidate
is an opener iff the `} from "./x";` beneath it gets rewritten):

| line | verdict | line | verdict |
| - | - | - | - |
| `import {` | **OPENER** | `export const gate: GateDescriptor = {` | not an opener |
| `import type {` | **OPENER** | `export function f(a: string) {` | not an opener |
| `export {` | **OPENER** | `export interface X {` | not an opener |
| `export type {` | **OPENER** | `export type T = {` | not an opener |
| `import Default, {` | **OPENER** | `export default {` · `export class C {` | not an opener |
| `import React , {` | **OPENER** | `export const gate = defineGate({` | not an opener |

`import type{` (no space before the brace) is **not** recognised — valid TypeScript, formatter-abnormal, and
it fails the SAFE way the author's own asymmetry argument names: an unrecognised opener leaves the `} from`
in the body, the specifier goes unshimmed, and the module dies loudly at `Cannot find module`. Correct
direction; noted, not filed.

**The interior rule and the unterminated block refuse, naming both lines.** Driven:

- a blank line inside a block → `opened a wrapped import at line 1 ("import {") and line 3 ("") is neither a
  brace-list member nor its closing …`
- a block reaching EOF → `… reached the end of the module without its closing …`
- `  type Alpha as Beta,` → accepted (the member grammar's `type`/`as` arms work)

**The identity proof asserts a non-empty body and names its boundary.** Driven on a pure re-export barrel:
`the header scan must STOP at the module BODY; it stopped at line 3 (""), leaving nothing below it to prove
identical`.

**Planted break — reverting the opener ALONE** (`cp f f.bak` → one-line revert to
`/^(?:import|export)\s[^"]*\{\s*$/u` → run → `mv f.bak f`; the harness diff against HEAD is EMPTY afterwards
and the tree is clean). Family 1 goes **8 of 14 RED**, including:

- the fixture-preservation control — `opened a wrapped import at line 4 ("export const gate: GateDescriptor = {")`
  — so that control is NON-VACUOUS, measured;
- **both whole-corpus replays** — `opened a wrapped import at line 10 ("export interface Finding {")`, which
  is the exact message the recheck brief named and is the closure-member vacuity below, now LOUD.

The mutator-symlink arm and the root-kind arm stay GREEN under the break, so they are independent pins. The
author's report says "7 of the then-13 arms"; the released tree gives **8 of 14** (their count predates one
arm). Same direction, same messages — a stale prose count, not a defect.

The break also shows parts 1 and 2 of the repair are independently load-bearing: with the loose opener
restored but the interior rule still in place, the previously SILENT swallow becomes a loud refusal.

### R1b — ADJUDICATING THE AUTHOR'S CORRECTION TO MY REVIEW — **THEY ARE RIGHT; I CONCEDE, AND IT IS BIGGER**

My row called the defect *latent* on a screen of the **22 entry blobs**. That screen was scoped to the wrong
population: the shim also runs over every member of the frozen relative-import CLOSURE. This is the
"an ABSENCE receipt owes its SCOPE as well as its method" failure, and it is mine.

I re-derived it independently with a faithful replica of the pre-fix scanner (the boundary is
resolution-independent in the old code, so no resolver is needed), over **every** closure member of **all 22**
entries rather than the author's four:

```
entries=22   closure members scanned=108
PRE-FIX vacuous body-identity proofs = 46
CURRENT shim refusals over the same population = 0
```

**46 of 108 member loads (43%) had a vacuous body-identity proof before this repair** — the author's replica
found 5 over 26 members from 4 entries; the full population is an order of magnitude larger. Eight distinct
member paths across the SHAs, opened by `export interface Finding {` (`contract/gate.ts:10`),
`export interface Violation {` (`contract/harness.ts`), `export interface DeclaredScan {`
(`contract/pass.ts`), `export function repoRel(…) {` (`lib/pass.ts`),
`export function unwrapExpression(…) {` (`lib/ast-read.ts`) and
`export function lexicalReferenceSymbol(…) {` (`lib/reference-fact-writes.ts`).

The corruption half stays latent — zero column-0 `} from "…";` lines in any swallowed region, so no
committed table was ever wrong. But "the assertion was live and vacuous on 43% of loads" is strictly
stronger than "latent", and it is the half that made the defect invisible.

**Corrected LD-2319-8 state cell (mine to correct, since I wrote it wrong):**

> **REPAIRED at 7d2d2c502, pending the integrator's sha.** The filing review called the defect *latent*;
> **CORRECTED 2026-09-13 by the repairer and re-derived independently over the full population: the VACUITY
> half was LIVE.** That review screened the 22 ENTRY blobs; the shim also runs over every frozen-CLOSURE
> member, and a replica of the pre-fix scanner over all 22 entries' closures (**108 members**) finds **46
> loads whose body-identity proof compared `""` to `""`** — eight distinct member paths, opened by
> `export interface Finding {` (`contract/gate.ts:10`) and five siblings. The CORRUPTION half remains latent
> (zero column-0 `} from "…";` in any swallowed region, so no committed table was wrong). The repair is
> three parts, not the filing review's suggested regex alone: the exact opener grammar (14 real openers,
> against 329 lines the loose form opened on, over 309 files), a scanner that REFUSES a block interior that
> is neither the closer nor a brace-list member and refuses an unterminated block, and an identity proof
> that asserts a NON-EMPTY body and names its boundary line. Planted break (opener alone reverted): 8 of 14
> family-1 arms red, both whole-corpus replays with
> `opened a wrapped import at line 10 ("export interface Finding {")`.

### R2 — LD-2319-9, the frozen reads are pinned — **CONFIRMED (driven, all three call sites)**

`frozenShow(base, repoPath, quiet)` carries `-C <cwd>`, `repoGitEnvironment()` and `GIT_READ_PREFIX`, and is
the only `git show` in the module. Driven with `GIT_DIR` **and** `GIT_OBJECT_DIRECTORY` **and**
`GIT_INDEX_FILE` all poisoned at a foreign repository:

| arm | result |
| - | - |
| positive control — an UNPINNED `git show` of the same ref | **THREW** (the poison is real) |
| `frozenBlob` (the closure read, `quiet`) via `frozenClosureOf` | OK — 12 members |
| `loadFrozenGate` (the tmpdir door) via `frozenFilesystemLegacyGate` | OK — `biome-grant-liveness` |
| `frozenLegacyGate` (the in-memory door) | OK — `no-color-literals` |

`quiet` correctly preserves the one caller that reads a failure as "absent at this SHA". The committed
control pins the same property with its own positive control.

### R3 — LD-2319-10, the guard's three questions and their ORDER — **CONFIRMED (driven)**

| root | refusal |
| - | - |
| a real directory outside the checkout | **ACCEPTED** (positive control) |
| a regular FILE outside the checkout | `must be a DIRECTORY` — the named refusal, no longer ENOTDIR |
| a regular FILE inside the checkout | `must live OUTSIDE the running checkout` — identity still answers first |
| a SYMLINK to a file inside the checkout | `must live OUTSIDE the running checkout` |
| a directory inside the checkout | `must live OUTSIDE the running checkout` |
| an absent path · a DANGLING symlink | `must be an existing directory … does not resolve at all` |

The guard created nothing on any arm. `containedSegment`'s non-`ENOENT` rethrow is now wrapped in the door's
own sentence, which closes the `{ "a": …, "a/b.ts": … }` bare-ENOTDIR half.

**The imported-grammar question — HONOURED.** `policy-repo-inventory.ts#rootDirectory` is module-private (no
`export`), so it is not importable; the path GRAMMAR (`assertPolicyRepoPath`) is exported and still imported.
A one-line `statSync(...).isDirectory()` predicate is not a grammar, and my original suggestion to "import it
rather than re-spell" was wrong about what is exported. The author's spelling is correct.

### R4 — the persisted arms are present and non-vacuous — **CONFIRMED**

- **fixture-string preservation** asserts four things: the fixture line is byte-identical, the body from the
  opener down is byte-identical, the REAL header import WAS rewritten, and **exactly one** specifier changed.
  Proven non-vacuous by the planted break (it goes red).
- **the mutator symlink arm** at the loader's exact staged filename, victim bytes asserted — present, and
  green independently of the shim under the break.
- **the four non-authored keys through both legs**, plus the no-root-created receipt, plus the pin that
  `stagedReplayTarget` does NOT refuse them (the two fences stay separate). One observability note, not a
  finding: that arm's setup calls `frozenFilesystemLegacyGate`, so it also reds on any loader regression — it
  is a pin of the fence, not an isolated one.
- **the root-kind arms** including the identity-before-kind precedence — present, green under the break.

### R5 — the coupled corrections — **CONFIRMED (each re-derived, not read)**

- `grant-liveness-legacy-replay.test.ts:46-56` now reads "5 rows, corrected 2026-09-13 from '7 rows'" and
  "THREE exemption-HONOURED examples … (3 rows, corrected 2026-09-13 …)", and states the DERIVING COMMAND
  plus the full census instead of a bare number. My own re-derivation agrees: 5 · 4 · 4 · 3 · 3 · 3 · 3 = 25.
- `diagnostic-legibility.ts:30-31` now reads "the **ten**-module `policy-soundness` family" and "the other
  **NINE**", with the ten members named in the comment. Re-derived by listing:
  `rg --files-with-matches 'family: "policy-soundness"'` → **10** files, matching the named list exactly.
- The report carries both dated in-place corrections (LD-2319-4's `: NONE` sentence, LD-2319-7's ENOTDIR
  parenthetical) in the form I proposed, plus a dated §7 write-site sentence.

### R6 — the floor — **CONFIRMED, with one REFUTED sub-item**

- **7 files / 41 tests passed**, exit 0. Family 1 is **14** (was 8: 8 pre-existing + 6 new); the other six
  suites total **27**, the same count as before (4 · 9 · 3 · 2 · 3 · 6). No pre-existing arm was dropped or
  renamed — all eight originals appear by name in the run.
- `pnpm check:structure --check diagnostic-legibility` → exit 1,
  `raw 92 = waived 0 + granted 0 + effective 92 (92 error, 0 warning) · 0 alarm(s) · 0 tool error(s)` —
  **92, unchanged** by the comment-only edit, spread over 65 distinct files, and **0** of the 92 name
  `diagnostic-legibility.ts` itself.

**R6b — the `biome-ignore lint/style/noProcessEnv` on the GIT_DIR restore line is an ESCAPE HATCH, not a
justified suppression. REFUTED.** The stated reason — *"`exportProcessEnv` (the sanctioned writer, used
above) can set a key but not delete one"* — is true of `exportProcessEnv` and false of its module. The SAME
file, `tooling/src/_shared/process-env.ts:44-58`, exports `withProcessEnv(key, value, run)`, whose whole job
is set-then-restore **including the delete branch**:

```ts
const wasPresent = Object.hasOwn(environment, key);
…
if (wasPresent) { environment[key] = previous; } else { delete environment[key]; }
```

The control's body already sits in an arrow the test could make `async` (sibling arms in this file are
`async` already), and the test already imports from that exact path. So the suppression is avoidable by
swapping `processEnvValue` + `exportProcessEnv` + the `Reflect.deleteProperty` finally for one
`await withProcessEnv("GIT_DIR", join(foreign, ".git"), async () => { … })`, and the constitution's bar is
"suppress only a genuine false positive". Not a security defect and not a merge blocker — but it is the one
banned-escape-hatch shape in the follow-up, and the fix is four lines. Filed as **LD-2319-11** below.

### R7 — the three declared limits, each with a RUN row — **CONFIRMED (all three driven)**

| declared limit | driven verdict | reachability over the real population |
| - | - | - |
| the zero-instance `import Default, {` arm | `import Default, {` and `import React , {` both open a block; it closes and the specifier is rewritten | 0 instances today, as declared; the arm works |
| the brace-list interior rule rejects a TRAILING COMMENT | `  alpha, // why` → **REFUSED**: `opened a wrapped import at line 1 ("import {") and line 2 ("  alpha, // why") is neither a brace-list member nor its closing` | **0 of 108** closure members refuse under the current shim |
| the non-empty-body assertion refuses a PURE RE-EXPORT BARREL | `export { a } from "./a";` + `export { b } from "./b";` → **REFUSED**: `the header scan must STOP at the module BODY; it stopped at line 3 (""), leaving nothing below it to prove identical` | **0 of 108** closure members refuse; and the limit is narrower than it reads — a barrel with any trailing COMMENT line is ACCEPTED (the comment becomes the body), so only a module whose last non-blank line is an import/export-from trips it |

`CURRENT shim refusals over the same population = 0` is the single number that prices all three limits: the
repaired scanner refuses nothing the harness actually loads today. Each is a real forward-looking limit for
family 3's backlog, each now has a run row, and none needs a code change.

### Ledger rows from this recheck

| id | class | module | what | state |
| - | - | - | - | - |
| `LD-2319-11` | banned-escape-hatch | `tests/tooling/verify/gates/grant-liveness-legacy-replay.test.ts` (the GIT_DIR control's `finally`) | The `GIT_DIR` restore uses `Reflect.deleteProperty(process.env, …)` under a `biome-ignore lint/style/noProcessEnv`, justified as *"`exportProcessEnv` … can set a key but not delete one"*. True of that function, false of its module: `tooling/src/_shared/process-env.ts:44-58` exports `withProcessEnv(key, value, run)`, which is exactly set-then-restore-or-DELETE and is the sanctioned door for this pattern. The suppression is therefore avoidable, and the constitution's bar is a genuine false positive. | **OPEN** — cosmetic; no security weight and not a merge blocker. Minimal fix: replace `processEnvValue`/`exportProcessEnv` plus the `finally` with one `await withProcessEnv("GIT_DIR", join(foreign, ".git"), async () => { … })` from the already-imported module, and drop the suppression |

**ledger rows OWED from the recheck: 1** (`LD-2319-11`). Plus one CORRECTION to a row I wrote: LD-2319-8's
latency cell, restated above in full — the vacuity was LIVE on 46 of 108 closure-member loads, which is my
error to fix, not the repairer's.

### Recheck floor

| check | result |
| - | - |
| the seven importer suites, on the cherry-picked six-commit stack | **7 files / 41 tests passed**, exit 0 |
| reviewer probe module 3 (opener grammar · interior and limits · the 108-member vacuity census · poisoned `GIT_*` · root-kind order) | exit 0, 5 tests; module deleted afterwards |
| planted break (opener reverted alone, `cp`/`mv`) | **8 of 14** family-1 arms red with the named messages; restored, the harness diff against HEAD EMPTY |
| `pnpm check:structure --check diagnostic-legibility` | exit 1, effective **92**, 0 alarms, 0 tool errors, 0 findings in that file |
| `pnpm check:docs` on this report | exit 0 |

The tree is clean after the probe module was removed and the planted break restored. The break touched a
real file in **my own** worktree only; nothing on `wt/agent-a2913d5f5cb4656c2`, `main`, the refutation
ledger, the catalog or the board was modified.

### What the recheck did NOT cover

No whole-tree battery, no `pnpm verify`, no mutation run. I did not re-review families 1–3's semantics (my
first pass' exclusions still stand), did not re-drive the write-site census (the repair adds no write —
verified by reading the diff, which touches no `writeFileSync`/`mkdirSync` call site), and did not exercise
the out-of-stack conformance-runner finding, which is still open and still routed rather than filed.
