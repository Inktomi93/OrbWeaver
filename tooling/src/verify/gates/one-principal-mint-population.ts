// Gate: one-principal-mint-population (#2381) — tracks the population of Principal OBJECT LITERAL
// construction sites in production server code. Principal is an INTERFACE (`@orb/contracts/identity`),
// so there is no class constructor; the "mint" is an object literal carrying the full five-field shape.
// Today there are exactly 4 mint sites caught by this regex, all under `entry/` (auth/seam.ts x1,
// compose/chat.ts x1, compose/imagery.ts x1, compose/search-discovery.ts x1). A new site means a new
// caller can fabricate
// a Principal, which is a security surface — it needs review.
//
// DETECTION: syntax-tier regex on blanked text. TWO discriminators that together identify a Principal
// mint with zero false positives on the current tree:
//   1. `: Principal =>` — an arrow function returning a Principal (the factory pattern)
//   2. `: Principal =` followed by `{` — a typed variable binding (the inline literal pattern)
//   3. `): Principal {` — a named function returning a Principal (principalFromRow)
// Each match is ONE mint site. The discriminator is the EXPLICIT type annotation, not the object shape.
//
// FAMILY: a declared SINGLETON under its own id. No shared reader exists for "who constructs a Principal
// object literal" — this is a population seal, not a shared predicate.
import { defineGate } from "../contract/policy.ts";
import { blankTsComments } from "../lib/comment-spans.ts";

// Three patterns that identify a Principal mint site. Each captures the `Principal` keyword as the
// token identity. Comment-blanked to avoid matching comments that describe Principal construction.
const MINT_PATTERNS: readonly { readonly re: RegExp; readonly what: string }[] = [
  { re: /:\s*Principal\s*=>/u, what: "arrow function returning Principal" },
  { re: /:\s*Principal\s*=\s*\{/u, what: "typed variable binding to a Principal literal" },
  { re: /\):\s*Principal\s*\{/u, what: "named function returning Principal" },
];

const MESSAGE =
  "a new Principal construction site in server production code — every mint site is a security surface because it decides WHICH caller identity downstream verbs see. Today there are exactly 4 sites, all in `entry/`. A new site needs review.";

export const gate = defineGate({
  id: "one-principal-mint-population",
  family: "one-principal-mint-population",
  authority: "ordinary",
  severity: "error",
  population: "@server",
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
              message: `Principal mint site (${what}) — a new caller identity constructor needs review.`,
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
  ],
});
