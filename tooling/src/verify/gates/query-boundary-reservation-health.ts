// Policy: query-boundary-reservation-health — the two whole-tree HARD arms of `query-boundary-reservation`
// (#885), split into their own policy (guide §12.6, #1950) because they need the ENTIRE client population
// where the occurrence arm is per-file, and because nobody may license either verdict:
//
//   B) a repeated LITERAL `reserveKey` is RED at every site — two mounts sharing one remembered box is the
//      copy-paste keying failure, and each site is only wrong because of the OTHER file, so no single-site
//      marker could ever speak for the pair (a deliberately shared surface routes through ONE exported
//      const, which this literal census deliberately cannot see);
//   D) the §4.6 blindness tripwire — the boundary's own home no longer spelling `reserveKey` in CODE means
//      the reservation seam every finding points at is gone.
//
// Both arms are hard, error, whole-tree: one authority, one severity, one execution, so one policy with two
// messages is the smallest complete contract (a split is owed only where an axis differs).
//
// FAMILY `query-boundary-reservation` — the shared reader is `lib/query-boundary-vocabulary.ts`
// (`jsxAttributeNamed`, `QUERY_BOUNDARY`, `RESERVE_KEY`, the home); arm D reads the home through the
// shared `blankTsComments` exactly as the legacy did (`reserveKey` spelled in CODE — a comment mention
// cannot keep the seam healthy).
//
// THE ANCHOR MOVES (§4.6): arm B reports on the key's STRING LITERAL at each site (the legacy anchored the
// attribute's start with the bare value as token); arm D anchors on the boundary home, the subject and a
// member of the population, where the legacy reported on the gate module's own path. Arm D self-guards on
// the home being loaded (a fixture or mini-project without it stays silent), exactly as the legacy did.
//
// Legacy descriptor: `370243fe7` (`tooling/src/verify/gates/query-boundary-reservation.ts`, arms B and D).
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { blankTsComments } from "../lib/comment-spans.ts";
import { jsxAttributeNamed, QUERY_BOUNDARY, QUERY_BOUNDARY_HOME, RESERVE_KEY } from "../lib/query-boundary-vocabulary.ts";

interface KeySite {
  readonly literal: MorphNode;
  readonly file: string;
  readonly line: number;
}

const MESSAGE =
  "the QueryBoundary reservation seam is unhealthy — a literal `reserveKey` minted at two sites (two mounts sharing one remembered box overwrite each other's memory), or the boundary home no longer spells `reserveKey` in code (the seam every finding points at is gone). See packages/client/src/components/query-boundary.tsx (#885).";
const FIX =
  "mint one key per surface, or hoist a deliberately shared surface's key into ONE exported const; restore `reserveKey` at the seam if the home stopped spelling it.";

const duplicate = (value: string, others: string): string =>
  `duplicate reserveKey "${value}" — also minted at ${others}. Two mounts sharing one box overwrite each other's memory; mint one key per surface, or hoist a deliberately shared surface's key into ONE exported const (packages/client/src/components/query-boundary.tsx).`;
const SEAM_GONE = `${QUERY_BOUNDARY_HOME} no longer spells \`${RESERVE_KEY}\` in code — the reservation seam every query-boundary-reservation finding points at is gone; re-derive the family in lib/query-boundary-vocabulary.ts.`;

export const gate = defineGate({
  id: "query-boundary-reservation-health",
  family: "query-boundary-reservation",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const sitesByKey = new Map<string, KeySite[]>();
    let homeLoaded = false;
    let homeSpellsKey = false;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxOpeningElement],
          visit: (node, sourceFile) => {
            if (!Node.isJsxOpeningElement(node) || node.getTagNameNode().getText() !== QUERY_BOUNDARY) {
              return;
            }
            const initializer = jsxAttributeNamed(node, RESERVE_KEY)?.getInitializer();
            if (initializer === undefined || !Node.isStringLiteral(initializer)) {
              return;
            }
            const value = initializer.getLiteralText();
            const sites = sitesByKey.get(value) ?? [];
            sites.push({ literal: initializer, file: ctx.relativePath(sourceFile), line: initializer.getStartLineNumber() });
            sitesByKey.set(value, sites);
          },
        },
      ],
      visitFile: (sourceFile) => {
        if (ctx.relativePath(sourceFile) === QUERY_BOUNDARY_HOME) {
          homeLoaded = true;
          homeSpellsKey = blankTsComments(sourceFile).includes(RESERVE_KEY);
        }
      },
      evaluate: () => {
        for (const [value, sites] of [...sitesByKey].toSorted(([left], [right]) => left.localeCompare(right))) {
          if (sites.length < 2) {
            continue;
          }
          for (const site of sites) {
            const others = sites
              .filter((other) => other !== site)
              .map((other) => `${other.file}:${other.line}`)
              .join(", ");
            ctx.report.node(site.literal, { message: duplicate(value, others), fix: FIX });
          }
        }
        if (homeLoaded && !homeSpellsKey) {
          ctx.report.file(QUERY_BOUNDARY_HOME, { line: 1, column: 1, message: SEAM_GONE, fix: FIX });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/dup1.tsx": 'export const G = <QueryBoundary fallback={null} reserveKey="chat.dup">{"b"}</QueryBoundary>;\n',
        "packages/client/src/features/a/dup2.tsx": 'export const H = <QueryBoundary fallback={null} reserveKey="chat.dup">{"b"}</QueryBoundary>;\n',
      },
      expect: { count: 2, token: '"chat.dup"', messageIncludes: "duplicate reserveKey" },
      why: "arm B: a copy-pasted literal key makes two surfaces overwrite one remembered box — RED at both sites, each naming the other, anchored on the key literal",
    },
    {
      mode: "source",
      files: { [QUERY_BOUNDARY_HOME]: "// reserveKey lived here once\nexport const QueryBoundary = null;\n" },
      expect: { count: 1, line: 1, messageIncludes: "no longer spells" },
      why: "arm D (§4.6): the seam's own source lost `reserveKey` — the vocabulary rotted; a comment mention cannot keep it green (blankTsComments)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/one.tsx": 'export const G = <QueryBoundary fallback={null} reserveKey="chat.one">{"b"}</QueryBoundary>;\n',
        "packages/client/src/features/a/two.tsx": 'export const H = <QueryBoundary fallback={null} reserveKey="chat.two">{"b"}</QueryBoundary>;\n',
      },
      why: "two DISTINCT literal keys are two surfaces with their own boxes — nothing to report. Reporting every key regardless of count reds this row",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/a/keys.ts": 'export const SHARED_KEY = "chat.shared";\n',
        "packages/client/src/features/a/one.tsx":
          'import { SHARED_KEY } from "./keys.ts";\nexport const G = <QueryBoundary fallback={null} reserveKey={SHARED_KEY}>{"b"}</QueryBoundary>;\n',
        "packages/client/src/features/a/two.tsx":
          'import { SHARED_KEY } from "./keys.ts";\nexport const H = <QueryBoundary fallback={null} reserveKey={SHARED_KEY}>{"b"}</QueryBoundary>;\n',
      },
      why: "DECLARED LIMIT, and the sanctioned shape: a deliberately shared surface routes its key through ONE exported const, which the LITERAL census deliberately cannot see — only string-literal keys are collected. Collecting expression keys would red this row",
    },
    {
      mode: "source",
      files: { [QUERY_BOUNDARY_HOME]: "export const QueryBoundary = (p: { reserveKey?: string }) => p.reserveKey;\n" },
      why: "the seam spelling `reserveKey` in CODE keeps the tripwire quiet — the live home's shape",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/a/plain.tsx": 'export const G = <QueryBoundary fallback={null} reserveKey="chat.only">{"b"}</QueryBoundary>;\n' },
      why: "THE HOME GUARD: with the boundary home absent from the fileset (a fixture, a mini-project) the seam tripwire self-guards off rather than declaring the seam gone. Deleting the `homeLoaded` guard reds this row",
    },
  ],
});
