// Gate: one-principal-mint-population (#2381) — tracks the population of Principal OBJECT LITERAL
// construction sites in production server code. Principal is an INTERFACE (`@orb/contracts/identity`),
// so there is no class constructor; the "mint" is an object literal carrying the full five-field shape.
// Today there are exactly 4 mint sites caught by this regex, all under `entry/` (auth/seam.ts x1,
// compose/chat.ts x1, compose/imagery.ts x1, compose/search-discovery.ts x1). A new site means a new
// caller can fabricate
// a Principal, which is a security surface — it needs review.
//
// DETECTION: syntax-tier regex on blanked text. FIVE discriminators that together identify a Principal
// mint with zero false positives on the current tree:
//   1. `: Principal =>` — an arrow function returning a Principal (the factory pattern)
//   2. `: Principal =` followed by `{` — a typed variable binding (the inline literal pattern)
//   3. `): Principal {` — a named function returning a Principal (principalFromRow)
//   4. `satisfies Principal` — the annotation-free mint (#2381 review, lane gate-scope-D 2026-09-19)
//   5. `as Principal` — an ASSERTED Principal, the strongest fabrication surface of all: it tells tsc to
//      stop asking, so an under-privileged row, a partial literal or a `JSON.parse` result can enter the
//      identity chain with no compiler objection whatever.
// Each match is ONE mint site. The discriminator is the EXPLICIT type POSITION, not the object shape.
//
// WHY 4 AND 5 EXIST. The landed version keyed only on the three ANNOTATION forms, and a seal that watches
// annotations is escaped by writing the same mint without one. Proven red-first at
// `packages/server/src/domain/chat/verbs/gd-probe-sat.ts`: two complete five-field Principal mints — one
// `satisfies Principal`, one `as Principal` — were reported ZERO times by the landed patterns while the
// annotated twin beside them flagged. A population seal whose escape is "omit the annotation" is not a
// seal. Both forms are ABSENT from the tree today (measured over `packages/server/src`), so adding them
// changes no live verdict and closes the door before the first user.
//
// FAMILY: a declared SINGLETON under its own id. No shared reader exists for "who constructs a Principal
// object literal" — this is a population seal, not a shared predicate. Its PAIR is
// `entry-synthetic-role-is-user` (#2382), which judges the SHAPE a mint carries rather than its position.
import { defineGate } from "../contract/policy.ts";
import { blankTsComments } from "../lib/comment-spans.ts";

// Five patterns that identify a Principal mint site. Each captures the `Principal` keyword as the
// token identity. Comment-blanked to avoid matching comments that describe Principal construction.
const MINT_PATTERNS: readonly { readonly re: RegExp; readonly what: string }[] = [
  { re: /:\s*Principal\s*=>/u, what: "arrow function returning Principal" },
  { re: /:\s*Principal\s*=\s*\{/u, what: "typed variable binding to a Principal literal" },
  { re: /\):\s*Principal\s*\{/u, what: "named function returning Principal" },
  { re: /\bsatisfies\s+Principal\b/u, what: "`satisfies Principal` — an annotation-free mint" },
  { re: /\bas\s+Principal\b/u, what: "`as Principal` — an ASSERTED Principal; the assertion silences every compiler check on the identity shape" },
];

const MESSAGE =
  "a new Principal construction site in server production code — every mint site is a security surface because it decides WHICH caller identity downstream verbs see. Today there are exactly 4 sites, all in `entry/`. A new site needs review.";

export const gate = defineGate({
  id: "one-principal-mint-population",
  family: "one-principal-mint-population",
  authority: "ordinary",
  severity: "error",
  // `@inference` ADDED 2026-09-20 (lane cb-gate-reach, the §12 EXTRACTION AUDIT of
  // `docs/design/orbweaver-inference-package.md`). ~104 source files left `packages/server/src/infra/providers/`
  // for the new `@orb/inference` workspace package, and every `@server`-scoped policy stopped judging them the
  // day they moved, silently. A fabricated Principal is a security surface wherever it is minted, and the inference package RECEIVES one
  // on every `resolve`/`availability`/`roleClientsFor` call — its build log claims outright that no `isOwner` or
  // `role === "owner"` read exists inside it. That claim had no enforcer. Measured at the widening: ZERO of the
  // five discriminators match anywhere under `packages/inference/src/`, so this seals a clean tree.
  population: { in: ["@server", "@inference"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use an existing resolver (createHostPrincipalResolver, resolvePrincipal) instead of minting a new Principal literal. A deliberate new site is waived with `@orb-waive one-principal-mint-population(<position>): <reason + end condition>` on the line above, where <position> is `Principal`.",
  create: (ctx) => ({
    visitFile: (sf) => {
      const raw = sf.getFullText();
      // Candidate fence: skip files that don't mention Principal at all.
      if (!raw.includes("Principal")) {
        return;
      }
      const file = ctx.relativePath(sf);
      const blanked = blankTsComments(sf);
      for (const [index, line] of blanked.split("\n").entries()) {
        for (const { re, what } of MINT_PATTERNS) {
          const match = re.exec(line);
          if (match !== null) {
            // Find the column of "Principal" within the match.
            const principalOffset = match[0].indexOf("Principal");
            ctx.report.file(file, {
              line: index + 1,
              column: match.index + principalOffset + 1,
              token: "Principal",
              message: `Principal mint site (${what}) — a new caller identity constructor needs review. (@orb/contracts/identity)`,
            });
          }
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/sneaky.ts":
          'const hostP = (id: string): Principal => ({ userId: id, role: "user", handle: id, externalId: null, via: "fallback" });\nexport const x = hostP;\n',
      },
      expect: { count: 1, token: "Principal" },
      why: "an arrow function returning Principal in a domain verb — outside the sanctioned entry/ homes, flagged",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/satisfied.ts":
          'export function mint(id: string) {\n  return { userId: id, role: "user", handle: id, externalId: null, via: "fallback" } satisfies Principal;\n}\n',
      },
      expect: { count: 1, token: "Principal" },
      why: "#2381 review (lane gate-scope-D): a complete five-field mint with NO type annotation anywhere — `satisfies` was the annotation-free escape the landed three patterns reported zero times, reproduced red-first on the tree",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/asserted.ts": "export function mint(row: unknown) {\n  return row as Principal;\n}\n",
      },
      expect: { count: 1, token: "Principal" },
      why: "#2381 review: an ASSERTED Principal from an `unknown` row — the assertion tells tsc to stop checking the identity shape entirely, so it is the strongest fabrication surface and the one an annotation-keyed seal is blindest to",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/entry/auth/ok.ts":
          '// @orb-waive one-principal-mint-population(Principal): the canonical cookie principal resolver; ends never (auth/seam.ts owns the cookie mint)\nconst hostP = (id: string): Principal => ({ userId: id, role: "user", handle: id, externalId: null, via: "fallback" });\nexport const x = hostP;\n',
      },
      why: "a waived Principal mint in entry/auth — the per-site escape proving the marker reaches it",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/comment.ts": "// The principalFromRow function returns a Principal.\nexport const x = 1;\n",
      },
      why: "a comment mentioning Principal is blanked and does not match — the comment projection excludes prose",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/consume.ts":
          'export function use(caller: Principal, other: Principal | null): string {\n  const list: Principal[] = other === null ? [caller] : [caller, other];\n  return list.map((p) => p.userId).join(",");\n}\n',
      },
      why: "THE NARROWING ROW for patterns 4 and 5: a parameter annotation, a union annotation and an array-type annotation all NAME Principal without constructing one. Widen `as`/`satisfies` to a bare `Principal` word match and this row reds — the seal counts mints, never mentions",
    },
  ],
});
