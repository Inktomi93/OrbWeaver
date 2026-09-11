---
kind: law
status: active
updated: 2026-09-08
---

# Authoring a structural gate

> **LEGACY UNTIL THE GATE-RUNTIME CUTOVER (owner, 2026-09-11).** This document describes the PRE-cutover
> descriptor runtime: `scanRoot`, `scopeSafety`, `run`/`begin`/`finalize` hooks, typed `ExemptionRow` tables
> with stale arms, `check-gates.int` fixtures, the registered-gates count. None of that exists in the final
> `defineGate` contract, and this file never mentions `defineGate`. **A lane CONVERTING a gate reads, in this
> order: [`docs/design/gate-runtime-standardization.md`](../../../../docs/design/gate-runtime-standardization.md)
> in full, [`docs/reviews/gate-runtime/exemplars-2026-09-11.md`](../../../../docs/reviews/gate-runtime/exemplars-2026-09-11.md)
> ("copy these shapes"), and `tooling/src/verify/contract/policy.ts`. It reads THIS file only to understand
> what the legacy descriptor it is replacing meant, and never copies a shape or satisfies a coupled-site
> checklist from it.** This file is rewritten against `defineGate` in the cutover commit (design doc,
> "Existing machinery we retain"). Until then it remains the law for a gate that is still a legacy descriptor.

> THE law for `tooling/src/verify/gates/**` (legacy descriptors; see the banner above). Read this IN FULL before adding, editing, renaming, or deleting a
> gate. It is the amnesiac-agent transfer of lessons that were paid for in silent-green gates, dead
> allowlists, and red conformance runs — every rule below is a defect that already happened.
> Indexed from `docs/architecture/core/AGENTS.md` §7. Supersedes `UI-Gates-and-Lessons.md` §12 (that
> section is the short form; where they differ, this doc wins). The gate catalog itself is
> `docs/architecture/core/Core-Enforcement-Active-Gates.md`.
> Before using raw ts-morph, read [TS-MORPH-CAPABILITIES.md](TS-MORPH-CAPABILITIES.md); it maps the installed API to the shared readers/providers and records the performance and node-lifecycle traps.
> Filesystem-backed tooling also reads [NODE-26-FILESYSTEM-CAPABILITIES.md](NODE-26-FILESYSTEM-CAPABILITIES.md) before adding a walker or dependency.

## 0. The one-screen version

| Step | Do |
| - | - |
| scaffold | `pnpm gate:new <kebab-name>` — writes the gate + prints every coupled site |
| write | fill the descriptor; ≥1 `mustFlag`, ≥1 `mustPass`, each with a `why` |
| couple | Core-Enforcement row · the `(N registered gates)` count · `check-gates.int` fixture OR `UNFIXTURABLE_GATES` |
| exempt | typed `ExemptionRow` (`why` mandatory) + a STALE arm + a real-tree anchor. Never a comment marker without a stale arm |
| posture | if it matches a literal against FILE TEXT, declare its COMMENT POSTURE in the header and wire it through `comment-spans.ts` (§5) |
| spell | read every member/import/literal through `lib/symbol-reference.ts` — one syntax is not the class (§5, #1506) |
| prove | `pnpm check:structure` on a REAL planted violation — conformance passing proves nothing about `scanRoot` |
| fix | violations found at landing get FIXED in the same lane. Allowlists are for PERMANENT deliberate exemptions only |

## 1. The descriptor contract

`tooling/src/verify/contract/gate.ts` is the whole interface. A gate never walks anything itself: it declares the
SyntaxKinds it wants and the runner (`pass.ts`) feeds it from ONE shared walk over the shared workspace
(`tooling/src/_shared/ts-workspace.ts` `harnessGlobs` — `packages/*/src`, `tests/`, `tooling/src/verify/gates/`,
and `tooling/src/` since the @orb/tooling P1 widening, docs/architecture/core/Core-Tooling-Law\.md §3.2).

| Field | Required | Meaning / trap |
| - | - | - |
| `name` | yes | kebab, MUST equal the filename — loader-enforced, hard error at load |
| `docRow` | yes | the `Core-Enforcement-Active-Gates.md` citation. `dangling-refs` resolves its `*.md`; `gate-modernization` resolves its `§` anchors |
| `status` | yes | `active` \| `dormant`. `runPass` filters to `active`; a dormant gate still runs its own conformance proof |
| `scopeSafety` | yes | `incremental-safe` (per-file verdicts) \| `whole-project`. LOAD-BEARING: a cross-file / registry / coverage gate marked `incremental-safe` FALSE-GREENS on scoped runs |
| `message` | yes | the reason, written ONCE. Printed as the group header; a `Finding` never repeats it |
| `fix` | no | how to correct it, printed once under the header |
| `scanRoot` | no | which files this gate reads AT ALL. See §3 — the #1 silent-green source |
| `kinds` + `visit` | one of | per-node subscription. `visit` MUST be read-only; accumulate into module state for `finalize` |
| `visitFile` | one of | per-file hook (line scans, per-file setup) |
| `run` | one of | whole-project pass over the SAME shared project — never `new Project(` |
| `fsBacked` | no | true when hooks read the real filesystem. Conformance then materializes examples into a real temp dir instead of an in-memory project |
| `markerImmune` | no | `pass.ts` offers the gate no suppression on either arm. TWO admitted classes, and only two: (a) a gate that AUDITS an exemption vocabulary — `gate-ignore-inventory`, `finding-overload-provenance`, and since 2026-09-02 `no-blanket-suppression` (#962: the LINTERS' suppression directives are its subject, and its two sanctioned escapes — narrow to a line/range counted by `suppressions`, or move the whole-file decision to a `biome.json` grant stale-armed by `biome-grant-liveness` — are each governed by another gate, so a marker here would be an ungoverned third door; the argument is written in docs/design/962-blanket-suppression-control-plane.md §2.4) — where a marker would absolve the very finding two-sidedness exists to produce; (b) THE D16 WIRE FIREWALL, `bus-payload-allowlist` (owner ruling 2026-09-01, #1048) — a security backstop whose findings are two-sided BY DESIGN and whose exemption door is a REVIEWED table row (`SANCTIONED_FIELDS`, with a D-cite), not a comment written by the same hand as the violation. Still not a "this gate is important" flag: a third occupant needs the same kind of argument, in writing, or the flag decays into exactly that |
| `begin` / `finalize` | no | reset accumulators / judge them. Ratchet + stale arms live in `finalize` |
| `mustFlag` / `mustPass` | yes | ≥1 each. The loader REFUSES an un-proven gate — this is fail-closed, not advisory |

**The loader IS the registry.** `loader.ts` globs `tooling/src/verify/gates/*.ts`, imports each in sorted order,
and validates the exported `gate`. There is no registration list to edit. Consequences:

- A gate-dir module that exports **no** `gate` (and no branded descriptor under another name) is recorded by
  the mixed loader as UNREGISTERED — never silently skipped (`lib/loader.ts`, #1584); `check:structure`
  reconciles the roster and `gate-modernization` arm A REDs the file — a gate file that registers nothing is RED.
- An INVALID descriptor is a hard load error attributed to its file, aborting the whole run. Never
  "temporarily" ship a half-descriptor.
- A duplicate `name` is a hard error.

**Reporting.** `ctx.report` has three shapes and they are NOT equivalent:

| Call | Anchors at | Honors `@orb-gate-ignore` |
| - | - | - |
| `report(node)` | the node | YES — the node's leading trivia, BLOCK-scoped (§4.3b) |
| `report(node, { token, offset })` | the token inside the node | YES — same, plus the `(position)` match |
| `report(finding)` | whatever the Finding says | YES since #828 — but LINE-ADJACENT only, and never at `line` 0 or 1 |

**Both overloads are suppressible, by DIFFERENT resolvers, and the difference is the whole rule.** The node
arm walks the reported node's leading comments up to its statement boundary and matches a `(position)`
against the reported `token`. The Finding arm has no node to read trivia from, so its marker must be the
comment on the line IMMEDIATELY ABOVE `finding.line` — the same adjacency every other house marker uses
(`biome-ignore`, `FABRICATION-OK`, `ONESHOT-OK`), because it is the only binding an author can predict
without knowing the gate's line arithmetic. A finding at `line` 0 (genuinely file-level) or `line` 1 has no
line above it and is UNSUPPRESSIBLE by construction, which is what keeps a blindness tripwire and a ledger
verdict permanently loud. **UNTIL 2026-08-30 (#828) the Finding arm honoured nothing at all**, so a
line-scanner gate had no per-site escape whatever: `test-determinism` was the case that paid for it — a
test whose SUBJECT is elapsed real time (a CPU-throttle receipt) could only contort, change instrument, or
be scanRoot-excluded wholesale. RULE, unchanged: node-anchored and suppressible ⇒ the NODE overload;
reserve the Finding overload for genuinely file-level findings, for line-scanner (`visitFile`) verdicts,
and for stale/ratchet arms (which anchor on the gate file itself).

**THIS CLAUSE NAMES ITS ENFORCER: `finding-overload-provenance`** (2026-08-08). It was prose-only until
then, and prose-only cost three closing sweeps: each matched report CALL SITES by regex and each one missed
members, because the finding record is routinely built two or three functions away from `ctx.report`. The
gate matches the FINDING LITERAL by SHAPE (`file` + `line` + `column`/`message`) wherever it is built.
**THE BAN SURVIVES #828; ITS REASON CHANGED** (the house idiom: the ruling survives, its INPUT changed).
The founding reason was that the marker was INERT there, so a correct marker earned a DOUBLE red — that is
gone, the Finding arm suppresses now. What remains is that a Finding literal's `line` is arithmetic the GATE
computed: the author's marker anchors to that arithmetic instead of to the node's own trivia, it gets no
block scope, and it can name no `(position)` unless the literal happens to carry a `token` — which makes
§4.3a UNSATISFIABLE on a line with two guarded things, the exact hole the position grammar exists to close.
The one escape, two-sided: `// @finding-overload-ok: <reason>` at the literal
for a PERMANENTLY non-suppressible arm (a blindness tripwire, a stale/ratchet arm, a ledger verdict — a
malformed, stale, or over-exempting marker is itself RED). The gate's OWN shrink-only baseline (52 literals
across 24 gates at mint) reached its terminal state `{}` 2026-08-23 and the baseline + its generator were
DELETED per this same §4.8 rule — the gate is born-compliant now, with no budget left to hide behind.
**A deliberately NON-suppressible node-anchored arm is legitimate and takes the marker, not a conversion** —
`baseui-derives-not-respells` ARM A ("hard, no exemption") and `schema-banned-shapes` (a ledger verdict's
only escape is contesting the D-cite) are the worked precedents.

**SCAN HEALTH — `ctx.scan`, and why a ✓ now carries a denominator** (2026-08-13, Codex GA-H-01/GA-H-02).
The harness tallies, for EVERY gate, from the one walk: how many files the run offered (`candidates`), how
many this gate's `scanRoot` admitted (`scanned`), how many a hook actually ran on (`visited`). They land on
each gate's line (`✓ own-tables-only · scanned 915/4796 files`), in `reports/check-structure.json` under
`gates[].scan`, and in `pnpm check:show`. No gate opts in and no descriptor field changed.

- **`scanned === 0` at real-tree scope is a TOOL ERROR (exit 2), not a pass.** It renders `⚠ <gate> …
  SCANNED ZERO FILES` and `report.ts` refuses the verdict. Every way of arriving there — a `scanRoot` that
  stopped matching after a rename, the absolute-vs-repo-relative path bug in §3, a fileset the run never
  loaded — was previously a SILENT ✓. Judged only at `report.ts`: a scoped run and a conformance
  mini-project both legitimately hand a gate zero in-scope files (§4.5 — `scope.kind` cannot tell them
  apart, so the entrypoint has to).
- **`ctx.scan({ … })` is the opt-in half**, for the two things the harness structurally cannot see. It is a
  context method, not a descriptor field, so all \~200 existing gates are untouched. Numerics accumulate.
  - `admitted` — findings a committed RATCHET BUDGET absolved this run, printed as
    `admitted-by-ratchet: N`. **Declared debt is not absence.** EVERY ledger-carrying gate owes this call,
    or its population is knowable only by running the generator — and worse, the single-pass's own
    `N finding(s) admitted by ratchet baselines` line then renders that debt as ZERO.
    **THIS CLAUSE NAMES ITS ENFORCER: `gate-modernization` ARM D** (2026-08-23, #551). It was prose-only
    until then, and prose-only cost exactly what it always costs: three of the six ledger-carrying gates
    (`suppressions`, `no-test-fabrication`, `no-hardcoded-model-prose`) were silent, so the printed total
    of 216 omitted 523 budgeted findings. ARM D flags any gate module whose string literals include a
    ratchet-ledger PATH while the module never calls `ctx.scan({ admitted })`, and carries the §4.6
    blindness tripwire (zero recognised ledger readers on the real tree is RED, not ✓).
    **The rows themselves are enumerable with `pnpm debt`** (`tooling/src/verify/ops/debt.ts`, #546) — the
    triage listing behind the count, which reconciles its declared ledger table against every committed
    `*.baseline.json` on the tree in BOTH directions and refuses to print a listing when they disagree.
  - `unit`/`candidates`/`scanned`/`skipped` — for a gate whose units are NOT workspace source files
    (`dangling-refs` reads markdown: `ctx.scan({ unit: "doc", scanned: docs.length })`). Without it such a
    gate's row reports a file count it never read, and it cannot distinguish itself from a blind gate.
  - `population` — **the SEMANTIC-MEMBER receipt (#946, 2026-09-01).** See below; it is the one part of
    scan health that is about the gate's SUBJECT rather than its fileset.

**SEMANTIC-MEMBER POPULATION — files visited is NOT the denominator a COVERAGE gate's verdict rests on**
(#946, from `docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md`). Twenty-four active
gates were shown to stay GREEN after supported members move behind an import, a spread, an inherited
interface, or a builder: the gate still visits its files, still has a subject, still renders a healthy
`scanned N/M files` — and judges a shrunken set. `admitted` closed this class one level up for ratchet debt;
this closes it for the population itself.

```ts
// the smallest optional contract — one field on the declaration a gate already makes
ctx.scan({ population: [{ source: "SectionDefinition", members: 10, unresolved: 1 }] });
```

| Field | Means |
| - | - |
| `source` | the stable name a reader DIFFS run over run (`"SectionDefinition"`, `"CHROME_ZONES"`). Declarations accumulate per source, so a gate may declare per discovery site or once in `finalize` |
| `members` | what the gate RESOLVED and actually judged |
| `unresolved` | declarations it SAW and could not resolve into members — an authoring shape outside its reader |

- **DECLARING IS THE OPT-IN. There is no descriptor flag beside it, deliberately** — a stored "judge me"
  boolean next to the call that produces the number is two facts that can disagree, the same argument §4's
  ratchet-class PARTITION makes. A gate that must not be judged simply does not declare.
- **Both refusals are exit-2, judged ONLY at `ops/structure.ts`** (`lib/population.ts` `populationAlarms`),
  the same placement and the same reason as the zero-SCAN alarm: a scoped run and a conformance
  mini-project both legitimately resolve zero members, so `scope.kind` cannot tell them apart.
  `members === 0` ⇒ the subject derivation came back EMPTY (the §4.6 blindness tripwire, in numbers) —
  unconditional. `unresolved > 0` **behind a GREEN verdict** ⇒ DENOMINATOR LOSS: a ✓ over a shrunken member
  set is the audited defect verbatim. A gate that already REPORTED the unreadable declaration (a #944
  fail-closed arm) rides the ordinary violation exit instead — one cause must not produce both a violation
  and a "the checker is broken" verdict, and the count still prints on its line as the receipt.
  Both alarms land in `reports/check-structure.json` `populationAlarms`,
  on the gate's console line (`SectionDefinition: 10 member(s), 1 UNRESOLVED`), and in `pnpm check:show`.
- **The corollary for the gate itself: never `continue` past a declaration you cannot read.** Report the
  finding, or count it `unresolved`, or both. A silent skip is the whole defect — see the six definition
  gates hardened by #944, whose readers all used to `return` on a non-literal initializer.
- **A COUNT NEVER PROVES CORRECTNESS.** A confidently wrong number is still wrong: this receipt makes a
  SHRINKING denominator loud, it says nothing about whether the members it resolved are the right ones.
  Every gate declaring a population still owes the per-shape planted controls its source law sanctions
  (imported initializer · tuple/object spread · interface inheritance · builder) — §5, and the
  permanent runner controls live at `tests/tooling/verify/lib/population.int.test.ts`.
- **Live occupants** (each with its own imported-definition control): `section-registry-completeness`,
  `placeholder-copy-registry`, `modal-registry-completeness`, `modal-body-not-placeholder`,
  `config-group-completeness` (three sources — three accumulators that shrink independently, so three
  declarations, never one summed number) and `chrome-registry-completeness` (whose ENTRY population sits
  beside its zone-VOCABULARY count for the same reason).

**AND THE PHASE MATTERS: a node-anchored report must not happen in `finalize`.** `gate-ignore-inventory`'s
STALE sweep also runs in `finalize`, and gates finalize in load (filename) order — so a marker consumed
after the sweep read its count is reported stale by mistake, which is the same author-hostile double-red.
Reconcile in `run` instead (every gate's `run` precedes every `finalize`, and `run` is still after the whole
walk, so accumulated state is complete); `no-inline-union-redecl`'s arm B is the worked example, and
`pass.ts`'s `gateIgnoreSuppressedInFinalize` tripwire REDs the day one slips through.

## 2. The COMPLETE coupled-sites list

Arming a gate touches these. Miss one and either `enforcement-registry-parity`, `check-gates.int`, or
nothing-at-all (the worst case) fires.

| # | Site | What |
| - | - | - |
| 1 | `tooling/src/verify/gates/<name>.ts` | the descriptor, with `mustFlag` + `mustPass` (each with a `why`) |
| 2 | `tests/tooling/check-gates.repo.int.test.ts` `writeFixtures()` | a `__g_` fixture: a minimal REAL-tree violation at the gate's anchor path |
| 2b | `tests/tooling/check-gates.repo.int.test.ts` `UNFIXTURABLE_GATES` | INSTEAD of 2, with a comment stating WHY no fixture can drive it (whole-corpus ratchets, real-manifest parity). Never fake a fixture |
| 3 | `docs/architecture/core/Core-Enforcement-Active-Gates.md` | the Layer-3 table row (`\| \`name\` \| what it enforces \|\`) |
| 4 | same doc, the `(N registered gates)` count line | bump it — `enforcement-registry-parity` reds until doc and loader agree |
| 5 | `package.json` + `tooling/src/verify/lib/registry.ts` | ONLY if the gate gets its OWN script/tier (like `check:orphan-ratchet`). A normal gate rides `structure:full` and needs neither |
| 6 | `tooling/src/verify/gates/<name>.baseline.json` + a `gen-*-baseline.ts` | ONLY for a ratchet gate. The generator is the single writer; the baseline is committed |

Sites 3+4 are what a "the gate works, why is check red?" question is 90% of the time.

## 3. `scanRoot` — path formats and the complex-predicate warning

**The two path forms are different and NOT interchangeable:**

| Where | Format | Match with |
| - | - | - |
| `scanRoot: (p) => …` | bare repo-relative, NO leading slash | `p.startsWith("packages/client/src/")` |
| `sf.getFilePath()` inside a hook | absolute `/…/packages/…` | `path.includes("/packages/client/src/")` |

Using the absolute form in a `scanRoot` makes the gate **never fire and stay GREEN** — a silent
false-negative, not an error. Synthetic `mustFlag`/`mustPass` examples use VIRTUAL paths, so **conformance
never catches this class.** Cross-check a sibling gate's path form, then prove the bite on the real tree.

Defensive middle ground (used by `density-tier`, `no-hover-display-swap`): `(p) => p.includes("packages/client/src/")`
makes no assumption about a leading slash at all.

**A complex `scanRoot` predicate is a coverage decision, and it is unreviewable by inspection.** \~16 gates
carry multi-clause predicates (unions of roots, negated segments, regex tests). Every clause is a claim that
the excluded files cannot violate the rule. Before writing one, run the predicate over the real file list and
READ what it drops. Two specific rules:

- **Scan-and-allowlist beats scanRoot-exclusion for sanctioned homes.** A sanctioned home scoped OUT of
  `scanRoot` carries its exemption silently through a rename or a move. The same home SCANNED plus a cited
  allowlist row goes RED at its new path (`macro-resolution-home`, `own-tables-only`, `no-hover-display-swap`
  are the precedents; `scrubber-home`'s exclusion shape is the anti-pattern). Add a rename tripwire in
  `finalize` (one finding per allowlist entry point missing from the tree).
- **A hard-coded FILE path constant dies on rename.** `const FACTORY_FILE = "…/create-x-form.ts"` that the
  gate DISPATCHES on goes silently green the day that file moves; tsc cannot see it and an import sweep
  misses it. Prefer deriving the target from a structural fact (an import specifier, a descriptor field, a
  schema export). When a path constant is unavoidable, pair it with a tripwire that REDS when the path stops
  resolving. Three gates went dead-green at once on one `index.ts` split; escaped-regex spellings
  (`chat\/index\.ts`) need sweeping too, not just plain strings.

## 4. The exemption grammar (LAW)

An exemption is a promise. This is how the promise is written.

1. **TYPED ROWS, NOT COMMENT MARKERS.** The house shape is `Record<key, ExemptionRow>` from `contract.ts` —
   `ExemptionRow` makes `why` mandatory at the type level. Widen by intersection
   (`ExemptionRow & { readonly owners: readonly string[] }`), never by re-declaring a parallel `{…, why}`
   shape. A `Record<string, string>` "path → reason" table is the legacy spelling; migrate it when you touch
   the gate.
2. **THE REASON IS MANDATORY AND CARRIES THE END CONDITION.** An exemption that cannot say what would end it
   is a permanent one. Write both: why it is granted, and what makes it deletable.
3. **COMMENT MARKERS, when a table cannot express the site** (`// allow-skip:`, `// terse-ok:`,
   `// FABRICATION-OK:`, `// @swallowed-ok:`, `// @typeonly-ok:`, `// @server-only:`): the house grammar is
   `marker:\s*\S` — **the reason after the colon is REQUIRED**, and a bare marker must exempt NOTHING. A
   bare-marker-exempts rule is a rubber stamp. For the shared `@orb-gate-ignore` vocabulary the **MENTION
   FENCE** applies (`pass.ts`, docs/history/design/gate-ignore-mention-fence.md, 2026-08-08): **a marker IS a `//`
   comment whose own text begins with the vocabulary** — the suppressor anchors its parse there (a
   quotation embedded in a prose comment above a reported node must never absolve it; that was a live
   bypass) and the inventory counts only comment-OPENER matches, so a grammar quotation in prose/JSDoc
   (backtick style) or inside a string literal is an inert MENTION everywhere — which is what lets
   `gate-ignore-inventory` scan the gate corpus itself without the corpus's own documentation self-flagging.
   3a. **THE MARKER NAMES ITS POSITION whenever ONE LINE can carry two guarded things**
   (`// @foreign-id-ok(<positionName>): <reason>`). A line-scoped marker OVER-EXEMPTS: the live corpus case
   is `record(chatId: string, sessionId: string)` — a foreign `sessionId` sitting beside one of OUR
   `chatId`s, where a line marker would silently absolve both. Two-sidedness then applies to the NAME too: a
   marker naming a position that is not live is RED, exactly as a stale row is. Paid for by
   `brand-in-name-position` (2026-08-03). **This clause NAMES ITS ENFORCER for the shared
   `@orb-gate-ignore` vocabulary: `gate-ignore-inventory`'s OVER-EXEMPT arm** — `pass.ts` counts what each
   marker suppressed, and an UNPOSITIONED marker that absolved more than one finding is RED (2026-08-03; it
   was prose-only until the §5 probe planted the counterfactual and watched one marker silently absolve
   both tokens). Corollary, paid for at the same time: **a marker grammar that names positions requires
   every gate it governs to EMIT positions.** While `no-loose-id-cast` reported node-anchored with no
   `token`, §4.3a there was not merely unenforced but UNSATISFIABLE — you cannot ask an author to name a
   position the report cannot express. A gate whose findings can CO-OCCUR on one line owes a `token`.
   3a-bis. **THE FINDING ARM BINDS LINE-ADJACENTLY, AND THE AUDITOR IS IMMUNE** (#828). A gate reporting
   through `ctx.report(finding)` has no node, so its marker is the comment on the line IMMEDIATELY above
   `finding.line`; a multi-line marker block, or a blank line between marker and violation, UN-marks it and
   the marker then reds as STALE — two reds, exactly as with every other house marker. Consumption is
   counted the same way, so `gate-ignore-inventory`'s STALE and OVER-EXEMPT arms cover this arm too. **And a
   gate that AUDITS an exemption vocabulary sets `markerImmune: true`** (§1): a marker written one line above
   the report that indicts it would absolve precisely the finding two-sidedness exists to produce, so the
   suppressor must never reach it. Since 2026-09-01 (#1048) §1 admits ONE further class by owner ruling —
   the D16 wire firewall `bus-payload-allowlist`, whose exemption door is a reviewed table row rather than
   a marker. Both classes share the same argument shape: the marker would grant, unreviewed, exactly the
   thing the gate exists to withhold. Read §1's cell before adding a third; "this gate matters" is not it.
   3b. **THE RESOLVER THAT READS STACKED MARKERS IS BLOCK-SCOPED.** Markers accumulate for the next guarded
   node and then CLEAR. A file-scoped reader silently exempts the rest of the file from the first marker
   onward — the same rubber stamp as a bare marker, just slower to notice.
4. **EVERY EXEMPTION VOCABULARY IS TWO-SIDED FROM BIRTH.** A row / marker / baseline entry that no longer
   matches a live violation MUST be RED ("stale entry — delete it"), never silence. One-sided exemptions rot
   into lies, and a stale marker is a LOADED GUN: the next violation written on that line inherits an
   exemption nobody granted it. In-tree gold standards: `own-tables-only.ts` (four stale arms),
   `no-hover-display-swap.ts` (`STALE_ENTRY_MESSAGE_PREFIX`), `monotonic-tests.ts` tooth 3 (the two-sided
   `allow-skip` marker), `bus-coverage.ts` (`STALE_MESSAGE`), `dialog-via-composite.ts`,
   `firehose-import-allowlist.ts`.
   4a. **TWO DISTINCT STALENESS MODES, ONE TEST.** (A) the row's file still exists but no longer violates
   ("you fixed it, delete the row" — every ratchet's "shrink-only" case). (B) the row's file is GONE
   (deleted/moved/renamed) — the row now names nothing at all. A gate that only implements (A) is
   silently blind to (B), because its usual shape is *"for each file the scan VISITED, compare against
   the table"* — a deleted file is never visited, so its row is never examined and the promise rots
   forever without a single red to announce it (`ui-size-via-variant` carried `tag-settings-row.tsx` — a
   file moved away 08-02 — silently for a full day; the same shape hit `dialog-via-composite`,
   `empty-state-has-action`, `no-arbitrary-tw-values`, `motion-token-purity` at once, 08-03). **The two
   modes collapse to ONE correct test if you write it right:** track a `seen`/`hit` SET populated only by
   a live match during the scan, guard the whole stale sweep on a real-tree ANCHOR (rule 5) that is NOT
   any row's own path, and then report every table key `seen` never claims — never gate a row's
   staleness on that SAME row's own file being loaded/existing (`fileLoaded(ctx, rel)` /
   `existsSync(join(root, rel))` keyed on the loop variable is the exact anti-pattern: it reads as a
   conformance-safety guard but it is IDENTICAL to "only judge a row if its file survived," which
   silences mode (B) by construction). `own-tables-only.ts`, `no-hover-display-swap.ts`,
   `no-raw-zustand-persist.ts`, `render-error-via-battery.ts`, `selection-store-via-factory.ts`,
   `sanctioned-css-homes.ts`, `query-machine-seals.ts`, `wire-schema-vocab-one-home.ts` are gold standards —
   each either checks `!seen.has(key)` unconditionally or explicitly branches on `sf === undefined` /
   `!existsSync(...)` as its OWN stale flavour. Every gate carrying a path-keyed exemption owes a
   `mustFlag` proving mode (B): an example that loads the real-tree anchor but NONE of the table's paths.
5. **A STALE ARM NEEDS A REAL-TREE ANCHOR, NOT A `scope.kind` CHECK.** `ctx.scope.kind === "project"` is
   TRUE inside gate-conformance's synthetic mini-projects too, so a scope-guarded stale arm fires there and
   reds the gate's own self-proof. Guard on a real-tree ANCHOR instead, and keep the gate's examples off the
   anchor's path. Both shapes are VALID:

   - `fileLoaded(ctx, "packages/db/src/schema/index.ts")` (`pass.ts`) — an anchor file present on every real
     run and never needed by an example (`own-tables-only`);
   - `existsSync(join(root, BASELINE_REL))` / a real-manifest guard (`verify-registry-parity`'s `"verify" in
     scripts` idiom, `density-tier`'s absent-baseline-in-temp-dir behavior) — the ALTERNATE anchor shape,
     equally sanctioned.

   **THE ANCHOR IS A FILESET QUESTION, NOT A PROJECT-MEMBERSHIP ONE (#505, 2026-08-22).** `fileLoaded`
   asks whether the path is in **`ctx.files`** — the fileset THIS RUN walked. It used to ask `ctx.project`,
   and a SCOPED run (`cli.ts scoped`) builds the FULL workspace Project and narrows only the fileset: the
   anchor answered TRUE on every scoped run, so every anchor-guarded stale sweep judged rows whose files
   the run never visited and called each of them stale. Measured on `--scope
   packages/ui/src/primitives/button` (3 files): **six false stale findings** across `no-manual-memo`,
   `no-floorless-control-in-wrap` and `tooling-front-door` — the last from a gate whose own line read
   `scanned 0/3 files` — and an issue was filed to DELETE all six live rows. Consequences for an author:
   `fileLoaded(ctx, ANCHOR)` alone is now correct for both hazards (conformance AND scoped); the
   belt-and-braces `ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)` spelling \~38 gates carry is
   still fine; and a bare `ctx.scope.kind === "project"` check alone is still WRONG (it is TRUE inside a
   conformance mini-project). Pinned by `tests/tooling/verify/ops/scoped.int.test.ts` §4.
6. **A GATE KEYED ON AN EXACT NAME MUST DETECT ITS OWN BLINDNESS.** If the gate looks up a symbol/file/table
   BY NAME, add the tripwire: when that name resolves to nothing on the real tree, RED. Otherwise a rename
   turns the whole gate into a no-op that reports ✓ forever (`firehose-import-allowlist`, `knob-wire-coverage`'s
   paired-anchor tripwire).
7. **FIX AT LANDING; DO NOT PARK (owner law).** A new gate's live violations get FIXED in the authoring lane.
   Allowlist/baseline rows are for genuinely PERMANENT deliberate exemptions — each with a reason and a stale
   arm — never temporary debt parking. A violation genuinely out of your lane's scope is an escalation with a
   stated default, not a silent row. A gate that ships with parked violations teaches the tree that red is
   negotiable.
8. **A BASELINE RATCHET is the ONE sanctioned handoff shape**, and only when the burn-down is another lane's
   named work. It is derived by a committed `gen-*-baseline.ts` (the single writer), it only ever SHRINKS,
   and it is two-sided: a row whose site no longer violates is RED ("regenerate and commit the shrink").
   Terminal state is `{}` + delete both the baseline and its generator — **and the READER too**: the
   loader, the suppression branch and the stale-row arms are dead vocabulary the moment the ledger is gone,
   and a surviving reader implements a ratchet no sanctioned writer can produce (`gate-modernization`'s
   ledger hit `{}` in its own landing lane, but its reader — loader, suppression branch, two stale arms,
   one `mustPass` row — survived until 2026-08-23). Live precedents: `density-tier`, `suppressions`; the
   completed terminal-state walks are `gate-modernization`, `finding-overload-provenance` (2026-08-23),
   `no-hardcoded-model-prose` (#578, 2026-08-23), and `no-test-fabrication` (#590, 2026-08-23).

**EVERY BASELINE ROW CARRIES A CLASS (#569, 2026-08-23).** A ratchet ledger is not automatically backlog:
some of what it admits is PERMANENT because a recorded ruling or a documented tool false positive made it so.
An undifferentiated count reads as "a glut of backlog" (owner), which is how a ruled decision gets
re-litigated every sweep. The row shape and every reader of it live at ONE home,
`tooling/src/_shared/ratchet-rows.ts`:

- **The class is a PARTITION, never a stored label.** A row is `3` (a bare count — class DEBT, the default
  spelling) or `{ "count": 3, "ratified": 3, "why": "…", "cite": ["<repo-relative path>", …] }`. `debt` is
  the remainder; `classOf` reads back `debt` | `ratified` | `mixed`. A stored class beside a count is two
  facts that can disagree — a partition cannot.
- **RATIFIED owes a `why` AND a resolving `cite`, and the promise is two-sided.** `ratchet-row-integrity`
  REDs a ratified row with no why, and REDs the STALE-WHY case: a cite naming a path that is no longer on
  the tree. A ratification must not outlive what justified it.
- **A DERIVED classification beats a declared one.** Where the class can be re-derived from the tree (the
  `suppressions` rule table), the gate re-derives it every run and REDs a row whose declared partition the
  tree does not earn — in EITHER direction. Then no hand-edit can mint permanence.
- **The generator carries the class through a regenerate** (`writeBudgetLedger`): counts are re-derived,
  rulings ride through. A regenerate that reset the class would erase the classification on its first shrink.
- **Every consumer splits the number.** `ctx.scan({ admitted, admittedRatified })` (the ratified half is a
  SUBSET, never a number beside it); the per-gate line and the single-pass footer print
  `N (D debt · R ratified)`; `pnpm debt` lists burnable rows separately from ruled ones; a gate diagnostic
  about a ratified row appends `classNote(row)` — the RULING, not remediation advice for a decided question.

**BASELINES LIE WHEN THE MATCHER HAS BLIND SPOTS.** `ui-size-via-variant` declared its debt baseline terminal
while 14 hits of its own incident class sat invisible — the matcher never stripped Tailwind's `!` important
modifier (both spellings: `!size-6` AND `size-6!`). When a ratchet reaches zero, RE-DERIVE the matcher's blind
spots (escape hatches, modifier prefixes, alternate spellings, wrapper expressions) before trusting the zero.
Probe the engine/tool directly for spelling variants; docs under-report.

## 5. The self-proof: `mustFlag` / `mustPass`

`conformance.ts` runs every example through the SAME dispatcher as the real run. A failure is a TOOL error
(exit 2), not a violation.

- `files` is either a code string (one virtual file at `at`, or a `scanRoot`-derived default path) or a
  path→source MAP (a mini-project — required whenever the gate's bite depends on another file).
- `expect: { count, line, messageIncludes }` — use `count` whenever per-occurrence granularity is the point.
- `why` is effectively mandatory: it is what a conformance failure prints. "the founding shape — the real
  defect this gate was minted from" is the useful register.
- A `mustPass` row is how a DECLARED LIMIT becomes a written baseline instead of an assumption. Write one per
  known blind spot (`own-tables-only`'s namespace-import row; `no-hover-display-swap`'s `@media (hover:hover)` row).

**A DEFINITION-DISCOVERY GATE OWES ONE ROW PER AUTHORING SHAPE ITS LAW SANCTIONS, AND A FAIL-CLOSED ROW FOR
THE REST** (#944, 2026-09-01). A gate whose subject is "the definition at the co-located path" has three
answers available for an initializer it cannot read, and only two of them are legal:

| Shape | The gate's answer |
| - | - |
| an object literal, incl. a whole-literal `as`/`satisfies` wrapper, and same-file indirection (`const d = {…}; export const x: T = d;`) | RESOLVE — still co-located, so the law is still establishable (`lib/ast-read.ts` `readObjectLiteral`) |
| an authoring shape the SOURCE LAW ratifies (the section FACTORY, `make<X>Section(…): SectionDefinition` — §6b/M3, live on four sections) | RESOLVE, with its own planted control (`readReturnedObjectLiteral`) |
| an IMPORTED identifier, a builder call, anything else | **FAIL CLOSED** — report it. The path check stays green through a re-home, so this finding is the only thing between the move and silence |
| *silently returning* | **never a valid third arm.** It is the audited escape verbatim |

Two traps this cost, both worth copying:

- **`getVariableDeclarations()` is not "every definition."** `section-registry-completeness` and
  `placeholder-copy-registry` read only annotated consts, so the four FACTORY sections
  (chats/characters/home/config) were outside every arm — a distinctness gate comparing 6 of 10 pairs and
  reporting a full file count. The shared discovery is now the first-class per-kind `registryDefinitionFacts`
  (`lib/registry-fact.ts`), one home, so the two subjects cannot drift apart again.
- **`startsWith("<Type>")` on an annotation also matches `<Type>[]`** — an ARRAY of definitions is an
  assembler's derivation, not a definition, and a fail-closed arm keyed on the loose prefix would accuse it.
  Match the head exactly (`=== "X"` or `startsWith("X<")`).

**SPELLING BLINDNESS — a detector keyed on ONE syntax is blind to the same semantics in another** (#1506,
2026-09-05). Three respellings walked past 21 live gates at once, each a SILENT GREEN:

| The escape | Why the gate never saw it | Read it with |
| - | - | - |
| `db["insert"](schema["chatDigests"])` | an ElementAccessExpression is not a PropertyAccessExpression, so a `getName()` detector is offered no node it recognises | `readMemberAccess` / `readsMemberNamed`, and subscribe to `MEMBER_ACCESS_KINDS`, never `PropertyAccessExpression` alone |
| `import * as events; events.subscribeAllChatEvents(…)` | a namespace import produces NO ImportSpecifier at all — an import-keyed gate is offered no node WHATSOEVER | `moduleMemberReference` (named import + namespace member are ONE reference), subscribing to `ImportSpecifier` PLUS `MEMBER_ACCESS_KINDS` |
| `role={ROLE}` · `margin: -8` | neither is a literal NODE (`Identifier`, `PrefixUnaryExpression`), so a literal-kind check answers "not my subject" | `readStringConstant` / `readNumericConstant` — both refuse an unreadable value rather than guessing |

The ONE home for all six readers is `tooling/src/verify/lib/symbol-reference.ts`; they only ever WIDEN
detection, so migrating a gate onto them cannot turn a live finding into a pass. Every migration owes a
`mustFlag` row per respelling AND a `mustPass` NEGATIVE control (a namespace member of the WRONG module, a
genuinely dynamic key), because a widened reader is exactly where a false positive would come from.

**THE AUTHORING CONTROL IS AUTOMATIC: `tests/tooling/gate-spelling-twins.int.test.ts`.** It respells every
gate's OWN `mustFlag` fixture — focused on the lines that gate actually reported, so a definition-site gate
is never asked about a spelling its subject cannot take — feeds the twin back through `verifyGateProofs`,
and compares the blind set against `tests/tooling/gate-spelling-twins.baseline.json`. The ledger is
SHRINK-ONLY and two-sided (§4.8): **a gate that becomes blind is RED even if it is brand new**, and a row
whose gate is no longer blind is RED. 83 gates were blind at mint — that population is a named follow-up
burn-down, and the remedy for a red is never a new row, it is the shared reader. The measurement that set
the design: respelling fixtures WHOLESALE produced 333 false "expected a finding, got 0" (rewriting a
`sqliteTable(…)`/zod/`tv()` DEFINITION into bracket form destroys the subject rather than respelling it),
against 304 for the focused twin — the focus is correctness, not tidiness.

**A MARKER-EXEMPT GATE OWES THE SIX-CASE REAL-TREE PROBE.** Copy this shape, do not re-derive it — the
conformance mini-projects prove the matcher, this proves the EXEMPTION VOCABULARY on the actual tree
(plant → verdict → remove; verify teardown is clean):

1. violation **without** a marker → RED (the gate bites at all);
2. marker **with its position name** → GREEN (the promise is honourable);
3. marker naming a **dead position** → RED (two-sided: a stale exemption is a loaded gun);
4. **MALFORMED** marker — no name and/or no reason → RED **as its own flavour**, because a marker that
   exempts nothing must not sit there LOOKING like protection;
5. the **derivation came back empty** → RED (the §4.6 blindness tripwire);
6. one `mustPass` row **per declared limit**.

Where a bare marker could cover two guarded things on one line, case 3 must also prove that ONE bare marker
across TWO sites reds and names both. Precedents: `brand-in-name-position`, `nullable-column-inequality`,
and — for the shared `@orb-gate-ignore` marker — `tests/tooling/gate-ignore-grammar.repo.int.test.ts`, which is
the probe MADE PERMANENT: it plants the six cases as `__g_` fixtures and runs the REAL gate corpus over the
REAL workspace. **Prefer that shape.** A one-shot manual probe proves the day it ran; a committed one keeps
proving. It is also the only substrate that can prove a CONSUMPTION verdict at all: conformance runs ONE
gate standalone (`runGateStandalone`), so no SIBLING gate can ever consume a marker in a mini-project, and
the stale / over-exempting arms are structurally unobservable there. Since #828 that suite carries a THIRD
carrier set for the LINE-ADJACENT Finding arm (`test-determinism` under `tests/`), because the two arms are
different resolvers and a green node-arm case says nothing about the other one; the fast resolver-level pins
(adjacency, position match, mention fence, `line` 0/1 unsuppressibility, `markerImmune`) are
`tests/tooling/verify/lib/gate-ignore.test.ts`.

**LITERAL-SHAPE BLINDNESS — the lying-proof class.** A reader that extracts a value via a narrow node check
(only `StringLiteral`, a bare `Identifier.getText()`) returns undefined on `x as never`, `satisfies`,
parenthesized, and `NoSubstitutionTemplateLiteral` shapes — and SILENTLY PASSES the violation. Rules:

- Read authored values through `tooling/src/verify/lib/ast-read.ts` (`unwrapExpression` / `readStringValue`), never a
  hand-rolled `Node.isStringLiteral(x) ? … : undefined`.
- A gate that SUBSCRIBES to the literal node KIND is wrapping-immune; the blindness lives in property/arg
  reads via narrow type guards.
- Every fixture must use the EXACT literal shape the reader parses. A probe the gate cannot read is a LYING
  PROOF.
- Cover every syntactic FORM of the banned shape (object vs array vs bare list; self-closing vs PAIRED JSX
  tags — a self-closing-only fixture set once shipped a confident false-positive factory; `.map()` vs
  `renderItem`; annotated vs inferred).
- Some gates match COMMENTS too — never spell a gate's trigger literally in prose near its scan root.
- A gate scanning STRING CONTENT must evaluate the initializer into its ORDERED runtime value first (follow
  identifier→const, join `+`-concats in order, gap `${…}` interpolations) and tokenize the WHOLE value.
  `.md` tokens routinely straddle a `+` boundary; `dangling-refs.ts` `evalString` is the precedent.

**EVERY LITERAL-MATCHING GATE DECLARES ITS COMMENT POSTURE** (2026-08-17, after the class recurred twice:
issue #117 read a `#106` issue citation in a comment as a 3-digit hex color; issue #132 read a comment
EXPLAINING a determinism fix as the banned call). The harness is pure-AST by law, so most gates are
comment-SAFE for free — but the moment a gate matches a literal or a regex against FILE TEXT
(`sf.getFullText()`, a `readFileSync` of a source file), comments are in its scan. Pick one of three, and
write which one in the gate header:

| Posture | What it means | How |
| - | - | - |
| comment-SAFE | the gate subscribes to node KINDS and reads authored values through `ast-read.ts` | nothing to do — say so if the gate looks textual |
| comment-BLIND ⇒ WIRE IT | it matches text, and a comment can change the verdict | route through `tooling/src/verify/lib/comment-spans.ts` (below) |
| comments-INTENDED | comments ARE the subject: a `// marker:` reader, a citation scanner, `commented-code` | say so in the header — a deliberate refusal is a decision, not an oversight |

`comment-spans.ts` is the ONE home; never hand-roll a `/\/\/[^\n]*/` strip (it also eats everything after a
`//` inside a STRING — a `https://` URL blanked the rest of its line in `domain-freshness-plane`, hiding a
`.insert(` behind it). Four doors:

- `blankTsComments(sf)` — the whole file's text with every comment span blanked, LENGTH-PRESERVING, so line
  numbers and column offsets stay exact. Leading AND trailing trivia (a same-line `code(); // …` is TRAILING
  and a leading-only sweep never saw it — that was #117's residual hole). Cached per SourceFile.
- `codeIncludes(sf, needle)` — the presence-check door, already fenced.
- `codeTextForScan(sf, couldMatch)` — the regex/line-scan door. **The CANDIDATE FENCE is a MEMORY decision,
  not a micro-optimisation:** blanking materialises every wrapped node for the file, and doing that for a
  whole tier (\~1,900 test files) OOMs the run at a 4GB heap limit. It is SOUND because blanking only ever
  REMOVES matches, so a file whose RAW text cannot match cannot match blanked either.
- `blankTsCommentsInText(text)` / `blankCssComments(text)` — for text read off the real filesystem (a CT
  mirror, a `surfaces/*.tsx`, a stylesheet). The TS one parses into a reused in-memory scratch project;
  its result is deliberately NOT cached, because `createSourceFile(..., { overwrite: true })` reuses the
  same SourceFile OBJECT and an identity cache then answers every later call with the FIRST file's text
  (it did — six conformance rows went green on one blanking).

**THE PERMISSIVE DIRECTION IS THE DANGEROUS ONE.** A false POSITIVE (a comment naming the banned shape) is
loud and gets fixed in an hour. A false PASS — a comment SATISFYING a presence check — is a gate that
reports ✓ forever: a verb "covered" by a `// TODO cover createX(`, a store action "driven" by a parked call
in its mirror, a rot tripwire "healthy" because a header still lists the arms somebody deleted. When you
wire a gate, ask which direction its needle points and write the mustFlag row for the permissive half.

**THE PROOF IS A ROW, NOT A PROBE RUN.** Each wiring owes a conformance example carrying the COMMENT shape
(a `mustFlag` when the comment must not exempt, a `mustPass` when it must not accuse) — and it must be a
row the raw matcher would actually catch, or it is a LYING PROOF that passes for the wrong reason (a CSS
comment `/* transition: 220ms */` does NOT match `motion-token-purity`'s regex, which anchors the property
on `^`/`;`/`{`; the row only became real as `/* .b { transition: 220ms … } */`). The receipt that catches
that: neuter `comment-spans.ts` to raw file text and re-run conformance — every wired gate must go RED.

**A CARRIER FENCE IS A COVERAGE DECISION, NOT A STYLE ONE.** Copying another gate's `className=`/`cn()`
ancestry fence loses every class string that reaches an element through a VARIABLE. Inherit a fence only when
the token shape is ambiguous English that sentences can carry (`shadow`, `rounded-lg`); a SELF-IDENTIFYING
shape (a `group-hover:` variant prefix) scans UNFENCED — strictly wider, no false positives. Probe the fence
against the real tree before inheriting it, and expect "already migrated" claims to be wrong.

## 6. Harness mechanics

| Thing | Behavior |
| - | - |
| discovery | glob `tooling/src/verify/gates/*.ts`, sorted, sequential import (deterministic per-file error attribution) |
| dispatch | ONE `forEachDescendant` per file; each node goes only to gates subscribed to its kind AND in `scanRoot` |
| phases | `begin` (all gates) → per-file `visitFile` + node walk → `run` (all) → `finalize` (all) |
| isolation | every hook is guarded; a throw becomes a `ToolError` attributed to gate+phase and does NOT abort siblings |
| ordering | findings canonical-sorted by (file, line, column, token, message) |
| DORMANT | `status:"dormant"` ⇒ `runPass` skips it, `report.ts` never prints it, `check-gates.int`'s `DORMANT_GATES` must list it. Conformance still runs it as-active. The descriptor's `status` is ground truth; the doc table and the test set are MIRRORS |
| scan health | every gate's `candidates`/`scanned`/`visited`/`admitted` are tallied from the same walk and printed on its line + written to `gates[].scan`. A gate declares extras via `ctx.scan` (§1) |
| zero-scan alarm | `scanned === 0` (and nothing declared) at `report.ts` scope ⇒ `⚠ … SCANNED ZERO FILES`, `scanAlarms` in the artifact, exit 2. NOT applied by `scoped.ts` or conformance — their zeros are legitimate |
| probe artifacts | findings on `__g_*` / `__dc_*` paths are stripped at the real-tree entrypoints (`report.ts`, `scoped.ts`) so a concurrent battery's transient fixtures can't red an independent run. `check-gates.int` opts out with `ORB_GATE_FIXTURES=1`. A gate whose fixture must live at a `__g_` path therefore CANNOT be fixture-driven — mark it `UNFIXTURABLE` |
| conformance substrate | pure-AST ⇒ ONE reused in-memory Project, each example under its OWN root `/repo-<n>` (#780, §12 — never cache on Project identity); `fsBacked:true` ⇒ a real auto-cleaned temp dir per example |
| scoped runs | `scoped.ts` runs only `incremental-safe` gates over the changed set — hence the `scopeSafety` trap in §1 |

## 7. Size, style, and the house patterns

- **File header ≤5 lines** for gates (the sanctioned widening of Documentation-Law's ≤3). A gate's header IS
  its contract: what it enforces, the arms, and the DECLARED LIMITS. Load-bearing warnings may be verbose —
  the `own-tables-only` / `no-hover-display-swap` headers are the register.
- **`component-size` counts comment lines.** A gate file near the cap cannot absorb a doc-comment expansion;
  gate files are exempt from the client cap but the general lesson stands — prose is not free.
- **Single-arm dispatch: `Record`, not `switch`.** A `switch` over a single-arm union trips biome
  `noUnnecessaryConditions` on the unreachable `default`, which forces a suppression, which overflows the
  suppressions baseline. Use a mapped-type `Record<Kind, Handler>` — one entry today, tsc requires the entry
  for any future arm. (MULTI-arm snake\_case unions invert this: a Record object literal trips
  `useNamingConvention`, so an annotated `switch` is correct there.)
- **No `biome-ignore` unless it is a genuine false positive**, with a cited reason, IMMEDIATELY above the
  flagged line. Suppressions are ratcheted tree-wide.
- **Never `biome check --write` / `format` / any fix-all** while working on gates.

## 8. Verification — a green conformance run proves NOTHING about the real tree

Run all of these before calling a gate done:

1. `pnpm check:structure` — the live pass (= `node tooling/src/verify/cli.ts structure`). READ the full
   output, **including your gate's scan denominator** (`scanned N/M files`): a ✓ over a count you did not
   expect is the §3 scanRoot trap mid-flight, and zero is a refused verdict.
   **This line used to read `pnpm exec tsx tooling/src/verify/ops/structure.ts`, and that spelling was a
   LIE for months (#509):** `ops/*.ts` are library modules with no main, so it loaded the module, ran no
   gate and exited 0 — with pnpm's own `✓ Lockfile passes…` lines printed over the silence. Every ops
   module now REFUSES direct invocation (exit 2 naming the real door,
   `tooling/src/_shared/entrypoint.ts`), pinned by `tests/tooling/_shared/entrypoint.int.test.ts`. The
   general law: a bare zero from an instrument is "I could not run", never "clean".
2. **Plant a REAL violation of the REAL shape** at a real path, watch it RED, remove it. Not a strawman: the
   machine proves the gate self-CONSISTENT, it cannot prove the examples are HONEST. A `mustFlag` that bites
   a toy while the real shape slips through is the failure mode.
3. `pnpm test:scoped tests/tooling/check-gates.repo.int.test.ts tests/tooling/gate-conformance.repo.int.test.ts`.
4. `pnpm check:structure` — and re-read it after any allowlist edit (stale arms only fire at project scope).
5. Never git-revert-probe. Never `git stash` / `git checkout <path>` / `git restore`.

## 9. Renames, deletions, and refactors that KILL gates silently

Every one of these has happened.

| Change | What dies | Sweep |
| - | - | - |
| a file rename/move | gates dispatching on a hard-coded path constant; escaped-regex path spellings | grep gates for the old basename AND its `\/`-escaped form; live-probe each |
| a barrel/front-door split (`index.ts` → re-exports) | `getVariableDeclaration` lookups (a re-export is NOT a declaration) — three gates died at once, one security-relevant | re-point at the DECLARING module; re-prove the bite |
| a shape refactor (arrow body → discriminated union) | arms keyed on the OLD shape match nothing; dead-green for six stages | the gate edit belongs IN the refactor stage; rewrite the `mustFlag` fixture in the NEW shape or it proves nothing |
| a union/tuple widening | derived-type consumers (`Extract<>` collapsing to `never`); registry-keyed arms | `pnpm ast` the DERIVED-TYPE consumers, not just the tuple name |
| deleting the last importer of an export | "de-export to satisfy knip" is usually the WRONG HALF — an unused export beside a "ONE derivation" claim is evidence the other call site still re-spells the rule inline. Wire the re-speller through the export | de-export only when nothing ever claimed an external consumer |
| branding a re-export | every consumer using `typeof <thatExport>` as an "any X" stand-in breaks | sweep `typeof <Name>` repo-wide BEFORE branding; prefer the library's real type |

## 10. When NOT to write a gate

- **Never mirror an enabled native lint rule.** Biome/ESLint already own it; a mirror gate is pure maintenance.
  The GritQL layer is RETIRED — do not add a grit plugin, add a Layer-3 gate.
- **Never gate a shape that is still settling.** A gate OSSIFIES. Document it instead until the shape is law.
- **Prefer keying off a LIVE single source of truth** (a registry, a closed `as const` tuple, a schema
  export, the auth matrix) over a path list. The best gate makes a defect class UNREPRESENTABLE rather than
  catching one instance.
- **But DO ask for one.** Every audit/review must answer, per structural rule it lands on: already enforced,
  assumed-but-unenforced, or unenforceable — and what gate makes the whole CLASS unrepresentable? A finding
  fixed by hand REGRESSES.

## 11. Exemplars — read these before writing anything

| Read | For |
| - | - |
| `gates/own-tables-only.ts` | the maximal shape: a DERIVED ownership map (not hand-written), two arms of differing strictness, three exemption tables + four stale arms, a real-tree anchor guard, and mustPass rows that write down every declared limit |
| `gates/no-hover-display-swap.ts` | a per-TOKEN literal scanner, the UNFENCED-carrier decision with its measurement, an empty-but-armed allowlist, and mustFlag rows covering every spelling of the banned shape |
| `gates/monotonic-tests.ts` | the two-sided COMMENT marker: reason required, and a marker guarding no skip is itself a violation. One shared definition of "a skip" read by both teeth |
| `gates/diagnostic-legibility.ts` | reading the gate corpus itself from the shared project via `scanRoot`, and resolving a value one level through a same-file const |
| `gates/dangling-refs.ts` | `fsBacked`, the ordered string evaluator (`evalString`), and SELF-CONTAINED conformance examples (every doc a passing example cites is PLANTED in the same mini-project) |
| `gates/density-tier.ts` | a baseline ratchet: per-file budget, excess-only reporting, generator as single writer, stale-row arm |
| `gates/gate-modernization.ts` | the meta-gate — the machine half of this document |

## 12. Caching — a gate MUST NOT cache on Project identity (added 2026-08-28, #780)

**The rule.** A gate may memoize a whole-corpus derivation for the duration of ONE PASS. It may not key that
memo on the ts-morph `Project` — no `WeakMap<Project, …>`, no "same project, so same answer". The sanctioned
shape is a value derived in `begin`, whose lifetime is exactly the pass and which therefore has no
invalidation problem at all:

```ts
// the vocabulary for THIS pass, re-derived in `begin`; lifetime = the pass, never a Project
let passVocabulary: ReadonlySet<string> = new Set<string>();
// a sibling-gate reader rides the pass value, and derives directly when this gate did not run in the
// caller's pass (conformance runs ONE gate standalone)
const vocabulary = passVocabulary.size > 0 ? passVocabulary : derive(sf.getProject().getSourceFiles());
```

**Why it is a rule and not a preference.** A Project-keyed memo is correct only for as long as the
CONFORMANCE SUBSTRATE happens to throw the key away between examples — i.e. its correctness depends on how
often something unrelated to the gate is discarded. `ops/conformance.ts` now reuses ONE in-memory Project
across every pure-AST example (\~105ms/example of lib.d.ts parsing, \~1500 examples, 27.6s → 7.9s on the
bite-proof), so such a memo silently serves a PREVIOUS example's derivation. That is not a red conformance
run — the gate keeps passing its own proofs while judging the wrong facts. `detached-work-traced` held
exactly this memo and three of its own rows changed verdict (#751).

**The substrate's other half, which is NOT optional.** Each example lands under its own virtual root
(`/repo-<n>`), because re-creating a file at a virtual path that already existed makes ts-morph's language
service serve the PREVIOUS document's snapshot: a re-created `SourceFile` restarts its script version, so
`Identifier.getDefinitionNodes()` returns nothing, or definitions at stale positions. Every gate resolving a
declaration through the language service then changes verdict silently. If you are optimising the substrate,
that invariant — never re-create a virtual path on a reused Project — is the load-bearing one; do not
"simplify" it away.

**The enforcer.** `tests/tooling/verify/ops/conformance.int.test.ts` runs every in-memory example
on BOTH substrates and compares FINDINGS, not pass/fail (a contaminated run satisfies mustFlag/mustPass by
accident — that is how this class hid). It carries a planted positive control for each corruption class, so
a pin that stopped biting is itself visible.
