// Policy: density-tier — every density-law occurrence in `packages/{client,ui}/src` is either licensed by
// an exact reviewed grant naming its FILE and the ACT it performs, or a finding with no door
// (docs/architecture/core/UI-Density-Law.md §5.1). There is no third state and no path is subtracted.
//
// FOUR ARMS, one authority, one verdict per `(file, act)`:
//   A1 elevated-radius — `rounded-card` at a class-string site. The ELEVATED family D6 rules it correct for
//      (modal/popover/drawer/toast/composer/chat bubble) is twelve exact grants, not a path subtraction.
//      45 of 51 non-pill radius choices were the largest step, which is what made every surface read as
//      boxes-in-boxes.
//   A2 box-in-box      — a border+radius+background triple nested inside another one (chrome diet CD2).
//   A3 text-axis:<axis> — a `features/**` call site passing `size`/`weight`/`tone`/`transform` to
//      <Text>/<Heading>: those are the @orb/ui-INTERNAL axes the voices are built from (§2.3). 336 taste
//      combinations is the mechanism by which nothing on a surface recedes; features pass `voice`.
//   A4 surface-tier-write — `data-surface-tier`, wherever it is written. Its ONE sanctioned writer is a
//      single exact grant (two writers = two disagreeing density maps, so a second one is a REVIEW event).
//
// === THE AUTHORITY MIGRATION, 2026-09-13 (#1939 / #1584 / #2176) — READ THIS BEFORE COPYING ANYTHING ===
//
// WHAT WAS HELD BEFORE: a committed PER-FILE COUNT RATCHET (`density-tier.baseline.json`, 22 file rows /
// 58 budgeted occurrences at deletion, every row `ratified === count` and ZERO debt) PLUS two gate-local
// path tables — `ELEVATED_ALLOW` (11 prefix rows) and a hardcoded `TIER_WRITER` constant. A file violated
// only when its LIVE count EXCEEDED its committed budget and only the EXCESS was reported; a budget the
// live count no longer spent was the A5a stale arm, and `ELEVATED_ALLOW`'s liveness was a hand-rolled A5b
// sweep asking whether each prefix still matched a live `rounded-card` class site.
//
// WHAT IS HELD NOW: `authority: "reviewed-grant"`, one finding per `(file, act)`, one exact grant row per
// ruled pair in `lib/reviewed-grants.ts`. No baseline, no counts, no generator, no gate-owned table of any
// kind. Owner ruling 2026-09-13 on #1939: ratified count baselines migrate to reviewed grants — not to a
// retained ratchet primitive and not to retirement — each row's `why` carrying over VERBATIM. The two PATH
// tables migrate the same way, for two independent reasons: standing law §5 ("gate-local allowlists, path
// subtractions … and exemption tables do not survive conversion"), and because the `lib/<family>.ts`
// `ExemptionTable` shape the `raw-typography-tier` precedent teaches is REJECTED by the live
// `policy-legacy-imports` policy (#2320 — eight findings across four families on this tree, including both
// halves of that precedent). `lib/density-tier.ts`'s header carries that measurement.
//
// WHICH DIRECTION EACH HALF MOVED — both, and in OPPOSITE directions. State this plainly wherever this
// policy is described; it is a MEASURED trade:
//   · THE RULED HALF GOT WEAKER IN ONE DIMENSION. Per-file CARDINALITY is gone. A NINTH `size=` site added
//     to `login-surface.tsx` — which today spends a budget of 8 — is now consumed by the same grant that
//     licenses the four existing ones, where the ratchet REDded it until someone regenerated the budget.
//     Grant identity is the finest the authored source can carry: a LINE is not stable across edits, so the
//     act is the axis, not the occurrence.
//   · THE RULED HALF GOT STRICTLY STRONGER IN ANOTHER. The budget was one number per FILE across all three
//     budgeted arms, so a NEW KIND of violation — a `transform=` in a file ruled only for `size`+`tone`, or
//     a box-in-box in a file ruled for its voice axes — was absolved by arithmetic whenever an old
//     occurrence left. Under `(file, act)` identity each act needs its own reviewed row, so a new kind fires
//     at its own file naming the act, and a ruled act whose last site disappears goes STALE centrally.
//   · THE UNRULED HALF IS UNCHANGED: a file with no row REDded at count 0 before and REDs with no grant now.
//   · THE TWO PATH TABLES GOT STRICTLY STRONGER, BOTH WAYS, and this is a STRENGTHENING rather than a
//     trade. (i) PRECISION: `ELEVATED_ALLOW`'s eight DIRECTORY prefixes silently covered every file under a
//     primitive directory, including files nobody had reviewed; the twelve grants name the exact files that
//     carry a live `rounded-card` class site. (ii) LIVENESS: the legacy A5b sweep was MODE A — does the
//     prefix still match a live class site — and the obvious `-health` port could only have done MODE B —
//     does the row resolve to a file. Central grant reconciliation IS mode A, for free: a granted file whose
//     last live site disappears is consumed zero times and raises `stale-reviewed-grant`. So A5b is
//     PRESERVED by this conversion rather than downgraded, and the tier-writer home gains liveness it never
//     had (a renamed `surface.tsx` used to take the A4 seal with it, silently).
//
// THE 22 BASELINE ROWS, CLASSIFIED AGAINST CURRENT SOURCE BEFORE MIGRATION (2026-09-13, the whole
// client+ui corpus through this module's own reader): all 22 still live, 58 live occurrences against 58
// budgeted, ZERO drained and ZERO in excess. Every row was therefore a live ratified exception and became
// grants; NONE was burned. The 22 rows produce 44 grants, because a row budgeting `size`+`tone` in one file
// is TWO ruled acts and central reconciliation matches a grant on the pair — the same shape the
// `duplicate-action-doors` correction ruled the same evening (six rows, twelve grants). Each row's `why`
// rides VERBATIM onto every grant it produced. The two path tables add 13 more (12 elevated-radius files +
// the one tier writer), for 57 `density-tier` grants in all.
//
// THE FOUR LEGACY RATCHET ARMS, EACH WITH ITS SUCCESSOR OR ITS OBITUARY:
//   · EXCEED (report only `findings.slice(budget)`) was the count ratchet. DELETED with the baseline
//     (standing law §5: numeric ratchets are forbidden where the value is derivable).
//   · A5a STALE ROW (a budget the live count no longer spends) survives with a STRONGER successor and no
//     code here: a ruled act with zero live sites produces no finding, its grant is consumed zero times, and
//     central reconciliation raises `stale-reviewed-grant`. Same verdict, owned by the engine, and it
//     additionally catches the OVER-BROAD direction the legacy arm had no word for.
//   · A5b ELEVATED_ALLOW LIVENESS is owned by the same engine arm, per FILE rather than per prefix: see the
//     STRENGTHENING bullet above. No policy code implements it and none should.
//   · `ctx.scan({ admitted, admittedRatified })` — the #569 admitted-by-ratchet split line — has no
//     successor because it has no subject: there is no budget to absolve anything. The grant table's
//     granted/effective/consumption counts are the reviewed-grant analogue and are reported centrally.
//
// A CORRECTED FALSE STATEMENT, recorded rather than silently deleted. The legacy module's `loadBaseline`
// comment read "Every density row is DEBT today — the density sweep is a burn-down, and a ratified density
// row would be a claim that a surface is permanently off-tier." Its own ledger contradicted it: all 22 rows
// carried `ratified === count` from `75d9f774a` (2026-08) onward, ZERO were debt, and `a6d519761` ratified
// the twenty-second. The comment was wrong about the artifact it introduced, and a reader who believed it
// would have classified this conversion as a burn-down and deleted 22 recorded owner rulings.
//
// MARKER CENSUS: ZERO, per file and in total. This gate never owned an `@orb-gate-ignore` vocabulary — its
// exemption mechanism was the baseline JSON plus two path tables, never a comment grammar — so nothing was
// translated and nothing was dropped. Verified by reading the legacy module in full at
// `4791ef15dc813861a7aa5362a6311e36b2671272`: no marker string, no consumption map, no stale-marker sweep.
// No product or test file changed for marker reasons in the conversion commit, which is the other half of
// that claim ("a gate with live markers and no product/test diff translated nothing").
//
// FAMILY `density-tier` — a TWO-member split family over `lib/density-tier.ts`. The shared canonical
// CALLABLE is `jsxAttributeLiterals`, reached from this policy's A4 arm and from
// `density-tier-slot-map`'s rogue-slot arm, and the shared DECLARATION is `UI_SOURCE_ROOT`. The split is by
// axis, not by topic: the slot-map sibling is `hard` where this is `reviewed-grant`, and it needs the
// ENTIRE population (does ANY ui file emit this slot) where this composes per file.
//
// LEGACY SHA: the conversion parent is `4791ef15dc813861a7aa5362a6311e36b2671272`. The legacy
// `GateDescriptor` at that revision is what the §6.4 differential replayed against.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standing law §2.1, 2026-09-13, lane p-convert-density-tier).
// Legacy `scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/")` becomes
// `["@client", "@ui"]` = `packages/client/src/` + `packages/ui/src/`. Over the SAME 7,704 harness candidates
// at `4791ef15d` (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy admits 1,687 and final
// admits 1,687. legacy − final = ∅. final − legacy = ∅. The only change is that a substring match becomes
// two anchored prefixes, and that distinction is empty on this tree. Controls: inside
// `packages/client/src/features/__dtlane_in/probe.tsx` (virtual) admitted by both; outside
// `packages/contracts/src/__dtlane_out/probe.ts` (virtual) rejected by both.
//
// DECLARED BLIND SPOT — this is a LITERAL-SHAPE reader. It sees string literals, template parts, and
// `tv()`/`cva()` object literals inside `className=` / `cn`/`clsx`/`cva`/`tv` calls. A className assembled
// from a variable, a conditional, or `cn(cond && STYLES)` where the classes live in another module is
// INVISIBLE to it, and an AST reader blind to computed shapes reports a silent GREEN. That is why the
// computed-value CTs (tests/ui/density-tier.suite.ct.tsx, UI-Density-Law.md §5.3) are the REQUIRED second
// lens, not a nice-to-have: they read back what the browser resolved.
import { defineGate } from "../contract/policy.ts";
import { densityOccurrences } from "../lib/density-tier.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const MESSAGE =
  "density-tier violation (docs/architecture/core/UI-Density-Law.md §3/§5.1): `rounded-card` outside the " +
  "ELEVATED family (D6 — it is the floating-island step: modal/popover/drawer/toast/composer/chat bubble), " +
  "a border+radius+background box nested inside another one (CD2 — one box deep, maximum), a feature " +
  "passing the @orb/ui-internal type axes instead of `voice` (§2.3), or a second writer of " +
  "`data-surface-tier`. Each `(file, act)` pair is one finding: either the act is wrong here, or it is a " +
  "ruling and takes an exact reviewed grant.";

const FIX =
  "rounded-card → rounded-base (grouped content inside a surface) / rounded-control (anything you operate) / " +
  "rounded-inset (a sub-control mark), or wrap the surface in <Surface tier> and let tiers.css resolve it; " +
  "un-nest the inner box (hairlines + gaps separate INSIDE a box, never a nested card); <Text size=… weight=…> " +
  '→ <Text voice="kicker|label|datum|hero|gloss|quiet|datumMono|monogram|reading|credit|masthead|focal|promoted">; ' +
  "write data-surface-tier ONLY via <Surface>. If the call site is a RULING rather than a defect, add ONE " +
  'exact reviewed grant to `tooling/src/verify/lib/reviewed-grants.ts` keyed `policyId: "density-tier"`, ' +
  "`subject: <the repo-relative file>`, `operation: <the act named in the finding>`, whose `why` states the " +
  "ruling and whose `endsWhen` names what retires it. One row licenses that act in that file; it goes STALE " +
  "the day its last live site disappears.";

/** The shared reporter's text bundle. No `unreadable` candidate can arise here — every occurrence is read
 *  off an AST node whose file path IS the subject and whose arm IS the operation, so the third string says
 *  so rather than pretending to an arm no fixture can reach. */
const REPORT_TEXT = {
  message: MESSAGE,
  fix: FIX,
  unreadableMessage: `${MESSAGE} (UNREACHABLE: this policy's subject is the admitted file path and its operation is the arm that matched, both always readable.)`,
} as const;

export const gate = defineGate({
  id: "density-tier",
  family: "density-tier",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  // Every arm composes over a subset: each verdict is decided inside ONE file (a class-string site, a JSX
  // ancestry walk within the same file, a feature call site, a tier-attribute stamp). The whole-population
  // questions — is a sanctioned-home row still live, does a mapped slot still have an emitter — are the two
  // siblings, which is why they are separate policies rather than a wider execution mode here.
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // Invocation state allocated in `create`: every occurrence the walk saw, as grant candidates. The
    // grouping into ONE finding per `(subject, operation)` is the shared reporter's law, never this
    // module's — a hand-rolled grouper here would be a private reader behind `defineGate`.
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitFile: (sourceFile) => {
        for (const occurrence of densityOccurrences(sourceFile, ctx.relativePath(sourceFile))) {
          candidates.push(occurrence);
        }
      },
      evaluate: () => {
        reportReviewedGrantCandidates(ctx.report, candidates, REPORT_TEXT);
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "packages/client/src/x.tsx", operation: "elevated-radius" },
      files: { "packages/client/src/x.tsx": 'export const G = <div className="rounded-card border border-border bg-card" />;\n' },
      expect: { count: 1, messageIncludes: "Subject: packages/client/src/x.tsx, operation: elevated-radius" },
      why: "A1 at a SHALLOW path, carried from the legacy descriptor's founding row: `rounded-card` outside the elevated family. The legacy row pinned `count: 1` only; the conversion strengthens it to the exact `(subject, operation)` pair central reconciliation matches a grant on, and this is the policy's GRANT WITNESS — the fixture emits exactly one finding, so the rerun with the authored identity must consume exactly one and leave zero effective",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/deep/nested/components/inner/box.tsx":
          'export const G = <div className="rounded-base border border-border bg-card"><span className="rounded-base border border-border bg-muted" /></div>;\n',
      },
      expect: { count: 1, messageIncludes: "operation: box-in-box" },
      why: 'A2 at a DEEPLY NESTED path (proves the matcher over the legacy\'s `scanRoot` substring form, §5.1): a box inside a box — chrome diet CD2. The legacy row pinned `token: "box-in-box"`, which the conversion re-derives as the OPERATION rather than a finding token, because the grant identity is what a reader must now spell',
    },
    {
      mode: "source",
      files: { "packages/client/src/features/rpg/components/thing.tsx": 'export const G = <Text size="micro" tone="muted">x</Text>;\n' },
      expect: { count: 2, messageIncludes: "operation: text-axis:size" },
      why: "A3: a feature passing two @orb/ui-internal type axes. THE LEGACY COUNT SURVIVES — two axes are still two findings — but for a different and stronger reason: each axis is its own ACT, so `size` being ruled here never licenses `tone`. Collapse `textVoiceOccurrences`'s operation to a bare `text-axis` in lib/density-tier.ts and this row drops to one finding; that is its falsifier",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/rogue.tsx": 'export const G = <div data-surface-tier="instrument" />;\n' },
      expect: { count: 1, messageIncludes: "operation: surface-tier-write" },
      why: "A4: a second writer of the tier attribute, carried from legacy. Under the conversion the ONE sanctioned writer is no longer a hardcoded `rel === TIER_WRITER` skip but an exact reviewed grant, so this row and the `surface.tsx` row below are the SAME predicate under two identities rather than a predicate and a scope hole",
    },
    {
      mode: "source",
      files: { "packages/ui/src/layout/surface.tsx": 'export const Surface = (): unknown => <div data-surface-tier="instrument" />;\n' },
      expect: { count: 1, messageIncludes: "Subject: packages/ui/src/layout/surface.tsx, operation: surface-tier-write" },
      why: "THE INVERTED LEGACY ROW, classified. `packages/ui/src/layout/surface.tsx` was a legacy `mustPass` because the descriptor skipped it by a hardcoded path; it now FLAGS and is licensed by the exact grant `density-tier:surface-tier-writer`. The predicate did not weaken — it stopped having a hole. Pinning the emitted `(subject, operation)` here is what makes the shipped grant row bindable; a respelled operation would leave the real writer red on the next run",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/thing/variants.ts": 'export const v = tv({ base: "rounded-card border border-border bg-card" });\n' },
      expect: { count: 1, messageIncludes: "operation: elevated-radius" },
      why: "A1 inside a `tv()` object literal — the variants-file shape a className-only scan misses, carried from legacy. The carrier fence admits a class-composer call at any depth; delete the `CLASS_STRING_CALLEES` arm and this row goes green while the attribute row stays red",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/template-carrier.tsx":
          'export const G = (on: boolean): unknown => <div className={`rounded-card border border-border ${on ? "bg-card" : "bg-muted"}`} />;\n',
      },
      expect: { count: 1, token: "rounded-card", messageIncludes: "operation: elevated-radius" },
      why: "THE TEMPLATE-PART CARRIER, and it is a caught defect rather than a coverage row. A `rounded-card` inside a TemplateHead has no derivable identity token, so the sink's scanner throws `cannot derive a nonempty authored position token from TemplateHead` and WITHHOLDS the whole policy — which is what happened on the real tree the moment the elevated-family path skip became grants and a template carrier first reached the reporter. `radiusHitOffsets` therefore hands the exact authored slice and its offset. Drop the `token`/`offset` pair in lib/density-tier.ts and this row does not merely fail, it TOOL-ERRORS: `token` is pinned here so the row is about the position and not only the count",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/one.tsx": 'export const A = <Text size="micro">a</Text>;\n',
        "packages/client/src/features/b/two.tsx": 'export const B = <Text size="micro">b</Text>;\n',
      },
      expect: { count: 2, messageIncludes: "operation: text-axis:size" },
      why: "THE INVENTED ROW for the conversion's core new property — the SUBJECT is the FILE, so the SAME act in two files is TWO findings and needs TWO grants. Were the subject anything coarser, one grant would match two findings, license NOTHING and raise `over-broad-reviewed-grant`. Planted-break receipt in the family test",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/two-acts.tsx":
          'export const G = <div className="rounded-base border border-border bg-card"><Text size="micro">x</Text><span className="rounded-base border border-border bg-muted" /></div>;\n',
      },
      expect: { count: 2, messageIncludes: "operation: box-in-box" },
      why: "THE INVENTED ROW for the guarantee the count ratchet LOST and this identity keeps: ONE file performing TWO DIFFERENT acts is TWO findings, so a file ruled for its voice axis is not thereby ruled for a box-in-box. Under the legacy per-file budget both collapsed into one number and the second act was absolved by arithmetic. Planted-break receipt in the family test",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/popover/variants.ts": 'export const v = tv({ base: "rounded-card border border-border bg-popover" });\n' },
      expect: { count: 1, messageIncludes: "Subject: packages/ui/src/primitives/popover/variants.ts, operation: elevated-radius" },
      why: "THE OTHER INVERTED LEGACY ROW, classified. The popover variants file was a legacy `mustPass` because `ELEVATED_ALLOW` subtracted its DIRECTORY; it now FLAGS and is licensed by the exact grant `density-tier:popover-variants-elevated-radius`. Two gains are stated here because a reader seeing twelve per-file grants where eleven prefix rows stood must be able to tell this was an upgrade: the permission became per-FILE (a prefix row silently covered every file in the primitive directory, including ones nobody reviewed), and it became MODE-A live (the day this file's last `rounded-card` disappears the grant is consumed zero times and central reconciliation stales it — exactly what the legacy A5b sweep hand-rolled, which a path-resolution tripwire could not do)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/x.tsx": 'export const G = <div className="rounded-base border border-border bg-card" />;\n' },
      why: "the grouped-content step at a shallow path — one box, correct radius: passes (carried from legacy)",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/deep/nested/components/inner/stat.tsx": 'export const G = <Text voice="datum">42</Text>;\n' },
      why: "the closed voice API at a deeply nested feature path — what A3 exists to push callers onto: passes (carried from legacy)",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/shared-thing.tsx": 'export const G = <Text size="micro">x</Text>;\n' },
      why: "A3 is FEATURES-scoped (`packages/client/src/features/`) — a client-shared composite is not a feature call site: passes (carried from legacy). Delete the `FEATURES_TIER` fence and this row goes red, which is its falsifier",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/copy.ts": 'export const label = "rounded-card is the elevated step";\n' },
      why: "the token as prose OUTSIDE a class-string site — the false positive the carrier fence guards (carried from legacy)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/paired-box.tsx":
          'export const G = <div className="rounded-base border border-border bg-card">one box, paired tags</div>;\n',
      },
      why: "A2's self-match guard: a PAIRED-tag box is not its own ancestor. The self-closing fixture missed this for a full stage in 2026-08 (S2), which is why both tag forms are pinned (carried from legacy)",
    },
    {
      mode: "source",
      files: { "packages/client/src/lib/message-bubble-class.ts": 'export const bubble = "rounded-card border border-border bg-card";\n' },
      why: "THE CARRIER FENCE AT A GRANTED PATH: this exact file holds a shipped `elevated-radius` grant, and the bare exported constant here is NOT a class-string site (no `className` attribute, no class-composer call). It passes for the FENCE's reason, not the grant's — which is the discrimination the conversion needs stated, because a reader could otherwise assume the grant is what silenced it. Delete the carrier fence and this row goes red while the grant stays unconsumed",
    },
  ],
});
