// Policy: query-boundary-reservation (#885; docs/design/885-884-boundary-reservation-and-touch-floor.md).
// A `QueryBoundary` whose fallback is a `SkeletonRows` with a STATIC count reserves a guess, not the box
// the surface settles at — the boot-CLS class home paid for (F14) and #885 sealed as `reserveKey`.
//
// THE SPLIT (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950): the legacy descriptor carried the per-file occurrence (arm A), a
// gate-owned two-sided marker grammar (`@first-boot-only`, arm C — EMPTY on the tree: zero live markers, so
// it DELETES rather than translating), and two whole-tree HARD arms — the duplicate literal `reserveKey`
// census (arm B) and the seam tripwire (arm D). Arm A is this policy — ordinary, `selected-files`; a boundary
// that genuinely never re-mounts is waived with `@orb-waive query-boundary-reservation(fallback): <reason>`
// and malformed / stale markers are central reconciliation alarms. Arms B and D share authority, severity
// and execution and are ONE `-health` sibling in this family, `query-boundary-reservation-health`.
//
// FAMILY `query-boundary-reservation` — the shared reader is `lib/query-boundary-vocabulary.ts`
// (`skeletonFallback`, `hasStaticCount`, `jsxAttributeNamed`, the element/attribute names and the home), so
// what this policy calls a boundary is exactly what the tripwires judge.
//
// THE REPORTED POSITION is the `fallback` ATTRIBUTE (derived token `fallback`), byte-identical to the legacy
// anchor, so the ordinary door is real: `@orb-waive query-boundary-reservation(fallback)`.
//
// POPULATION PORT: byte-identical — the legacy `scanRoot` admitted `packages/client/src/`, which is
// `@client`. `tests/` was NEVER in the population (the retired roster row said otherwise; the code is the
// law).
//
// DECLARED LIMITS, each a `mustPass` row: a DYNAMIC count (prop/call/ternary) passes — it is usually already
// box-aware and the caller owns the number; a SkeletonRows reached through a wrapper component or nested
// inside another element is invisible to the direct-fallback reader; the tags are matched by NAME (the
// identity upgrade is deferred with the same receipt `sub-floor-disclosure` records).
//
// MARKER CENSUS AT CONVERSION (§8.6): `@first-boot-only` had 0 live marker-form sites (its only mention is
// the central engine's foreign-grammar fixture) — an empty grammar, deleted; nothing to reconcile.
//
// Legacy descriptor: `370243fe7` (`tooling/src/verify/gates/query-boundary-reservation.ts`).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `query-boundary-reservation` descriptor at e2b183b809625973be3060bdca51755317d42f3c, the parent of the conversion
// `6563946a0` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `370243fe7`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,450 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,319 and final `population` admits 1,319.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { hasStaticCount, jsxAttributeNamed, QUERY_BOUNDARY, RESERVE_KEY, skeletonFallback } from "../lib/query-boundary-vocabulary.ts";

const MESSAGE =
  "a QueryBoundary whose fallback is a SkeletonRows with a STATIC count and no `reserveKey` — the surface " +
  "reserves a guessed box and shifts everything below it when the read lands (the F14 boot-CLS class). " +
  "`reserveKey` opts the boundary into measure-then-remember: the remembered box reserves, the count " +
  "re-fills it, the settled child re-measures (#885, query-boundary.tsx).";
const FIX =
  'add `reserveKey="<feature>.<surface>"` (the literal count stays as the first-boot guess), or — only for ' +
  "a boundary that genuinely never re-mounts — `// @orb-waive query-boundary-reservation(fallback): <why it never re-mounts>` " +
  "on the line above the element; the position is the `fallback` attribute name. One boundary is one finding.";

export const gate = defineGate({
  id: "query-boundary-reservation",
  family: "query-boundary-reservation",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxOpeningElement],
        visit: (node, sourceFile) => {
          if (!Node.isJsxOpeningElement(node) || node.getTagNameNode().getText() !== QUERY_BOUNDARY || jsxAttributeNamed(node, RESERVE_KEY) !== undefined) {
            return; // keyed — arm A satisfied whatever the fallback is
          }
          const skeleton = skeletonFallback(node);
          if (skeleton === undefined || !hasStaticCount(skeleton, sourceFile)) {
            return;
          }
          ctx.report.node(jsxAttributeNamed(node, "fallback") ?? node);
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/unkeyed.tsx":
          'export const G = <QueryBoundary fallback={<SkeletonRows count={3} shape="line" />}>{"b"}</QueryBoundary>;\n',
      },
      expect: { count: 1, token: "fallback" },
      why: "the founding shape — a static-count skeleton fallback with no reserveKey reserves a guess (F14)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/constcount.tsx":
          'const ROWS = 4;\nexport const G = <QueryBoundary fallback={<SkeletonRows count={ROWS} />}>{"b"}</QueryBoundary>;\n',
      },
      expect: { count: 1, token: "fallback" },
      why: "the trivial dodge: a same-file const numeric count is still a static guess",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/retired.tsx":
          '// @first-boot-only: the retired grammar\nexport const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
      },
      expect: { count: 1, token: "fallback" },
      why: "THE RETIRED GRAMMAR IS INERT TEXT: a legacy `@first-boot-only` marker exempts nothing any more — the finding stands (the grammar had zero live sites, so nothing was lost)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/keyed.tsx":
          'export const G = <QueryBoundary fallback={<SkeletonRows count={3} />} reserveKey="a.b">{"c"}</QueryBoundary>;\n',
      },
      why: "the sealed shape: keyed, the literal count survives as the first-boot guess. Deleting the keyed short-circuit reds this row",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/dynamic.tsx":
          'export const G = (p: { n?: number }) => <QueryBoundary fallback={<SkeletonRows count={p.n ?? 4} />}>{"b"}</QueryBoundary>;\n',
      },
      why: "DECLARED LIMIT: a dynamic count (prop-driven) is not a static guess — the caller owns the number. Replacing `hasStaticCount` with `true` reds this row",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/textfallback.tsx": 'export const G = <QueryBoundary fallback={<Text>Loading…</Text>}>{"b"}</QueryBoundary>;\n' },
      why: "a non-SkeletonRows fallback is outside arm A (the counted tail — design doc §5), not a violation — an OPENING element, refused by the self-closing half of the fallback reader",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/spinner.tsx": 'export const G = <QueryBoundary fallback={<Spinner count={3} />}>{"b"}</QueryBoundary>;\n' },
      why: "THE TAG-NAME HALF of the fallback reader, pinned: a SELF-CLOSING fallback with a static count that is NOT a SkeletonRows is not the subject. Dropping the SkeletonRows tag check reds this row (the `<Text>` row above cannot — it is refused by the self-closing half first)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/wrapped.tsx":
          'export const G = <QueryBoundary fallback={<Stack><SkeletonRows count={3} /></Stack>}>{"b"}</QueryBoundary>;\n',
      },
      why: "DECLARED LIMIT: a SkeletonRows nested under a wrapper element is invisible to the direct-fallback reader",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/other-tag.tsx": 'export const G = <Boundary fallback={<SkeletonRows count={3} />}>{"b"}</Boundary>;\n' },
      why: "the tag-name fence: a static skeleton fallback on ANY OTHER element is not this policy's subject. Deleting the QueryBoundary tag check reds this row",
    },
    {
      mode: "source",
      files: {
        "tests/client/features/a/story.ct.tsx": 'export const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
        "packages/client/src/features/a/clean.tsx": "export const clean = true;\n",
      },
      why: "THE POPULATION PORT: `tests/` was never in the legacy scanRoot and is not in the population — a story's fallback reserves nothing durable and is not judged. The clean client file keeps the fixture admitted",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/marked.tsx":
          '// @orb-waive query-boundary-reservation(fallback): mounts once at app boot and never again — nothing to remember between mounts.\nexport const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the reported position — the `fallback` attribute — suppresses the twin of mustFlag[0]. One finding, one marker, zero effective findings and zero authority alarms",
    },
  ],
});
