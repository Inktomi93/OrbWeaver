// Policy: no-banned-tw-utility (#1656, #1175) — a Tailwind utility whose VALUE the house has ruled
// against, named by its exact class token. `BANNED_UTILITIES` is the whole subject: one entry per ruled
// token, and the entry's own text is the finding's explanation, so the rule and its reason share a home.
//
// THE ONE ENTRY TODAY is `max-w-prose`. Tailwind's `prose` measure is 65 CSS `ch`, which in Geist renders
// as 93-101 typographic characters — past the house 65-75 reading measure at both ends and matching no
// token. Body/teaching prose takes `max-w-(--reading-measure-prose)` ON THE PARAGRAPH; an editor's content
// column takes `max-w-(--width-content-col)`. The re-points away from it are recorded at the sites that
// made them (`roster-member-surface.tsx:156`, `plugin-row-leaves.tsx:209`, `tag-member-surface.tsx:100`,
// `regex-member-surface.tsx:90`, `databank-detail-surface.tsx:198`, `compact-summary-peek.tsx:34`).
//
// SIBLING OF `no-arbitrary-tw-values`, SAME FAMILY (`tailwind-class-token`), SPLIT BY AUTHORITY, which §4
// requires rather than permits. That policy is `ordinary`: an off-token bracket is a local call an author
// can waive at the site with a reason. A BANNED UTILITY is a house ruling about a value, so its exceptions
// are `reviewed-grant` rows in the central table with a `why` and an `endsWhen` — reviewed once, centrally,
// never per-site. Both read their class tokens through the one `lib/tailwind-class-token.ts` reader, which
// is what makes them a family and not two spellings of one question.
//
// POPULATION: `@client` + `@ui` SOURCE, the same two packages the sibling walks. That fence is what
// excludes the tailwind-merge conflict-pair fixture at `tests/ui/lib/class-merge.test.ts:80` — a string
// naming the class, never an application of it. It is excluded BY CONSTRUCTION and must never acquire an
// exemption: a fixture that must name the token to test the merge behaviour is not a violation of anything.
// `entire-population` because a grant's liveness is a whole-population verdict (the same reason
// `no-raw-matchmedia` carries it).
//
// BORN GREEN ON A FIXED TREE, and the census is 2026-09-19's, re-derived rather than inherited. The #1656
// body said "two transcript sites"; the #2451 re-cut said exactly one. Both are stale: there are TWO live
// class APPLICATIONS, each already refused in place with its own receipt —
// `packages/client/src/lib/message-bubble-class.ts:37` (refusal at `:25`, "`max-w-prose` STAYS HERE, AND IT
// IS THE ONE PLACE IT DOES") and `packages/client/src/features/chat/lib/message-row-variants.ts:367`
// (refusal at `:363`, "`max-w-prose` is DELIBERATE RESIDUE here … this is transcript geometry"). Both are
// the same #1145/#1175 transcript-bubble ruling, so both are grant rows and neither is debt parking. Every
// other product hit of the string is a COMMENT recording a re-point away from it.
//
// RETIRED MARKERS: none — a new policy with no legacy owner.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { readTailwindClassTokens } from "../lib/tailwind-class-token.ts";

/** The ruled tokens, each mapped to the reason it is ruled — keyed by the EXACT terminal class token, so a
 *  class that merely CONTAINS the string (`max-w-prose-wide`, `not-max-w-prose`) is a different utility and
 *  is not this policy's subject. A variant prefix does not change the ruling: `md:max-w-prose` is the same
 *  value on the same utility, so the terminal segment is what is matched. */
const BANNED_UTILITIES: Readonly<Record<string, string>> = {
  "max-w-prose":
    "Tailwind's 65 CSS `ch` is 93-101 typographic characters in Geist and satisfies no house measure. " +
    "Body/teaching prose takes `max-w-(--reading-measure-prose)` ON THE PARAGRAPH; an editor's content column " +
    "takes `max-w-(--width-content-col)`.",
};

/** The rulings, DERIVED from the table rather than restated beside it, so a second banned utility cannot
 *  land with its reason missing from what an author reads (§7: a comment quoting a set must derive it). */
const RULINGS = Object.entries(BANNED_UTILITIES)
  .map(([token, reason]) => `\`${token}\` — ${reason}`)
  .join(" ");

const MESSAGE = `a Tailwind utility the house has ruled against (UI-Theming-and-Content.md, #1175). ${RULINGS}`;

const UNREADABLE = `${MESSAGE} The class token could not be read, so which ruled utility this is CANNOT be established — reported rather than passed.`;

const FIX =
  "re-point the class at the token the house ruled in its place (the reason on the finding names it). A " +
  "deliberate, reviewed occurrence is an exact row in tooling/src/verify/lib/reviewed-grants.ts naming " +
  "`(no-banned-tw-utility, <the file>, banned-tw-utility:<the class token>)` with its `why` and `endsWhen` " +
  "— there is no per-site marker for this policy, because the ruling is not a local call.";

/** The grant OPERATION: the licensed act is "apply THIS ruled utility", so the token rides the operation
 *  rather than the subject. A file granted `max-w-prose` therefore does not thereby get a future second
 *  banned utility for free — that would be a new row. */
function operationOf(token: string): string {
  return `banned-tw-utility:${token}`;
}

export const gate = defineGate({
  id: "no-banned-tw-utility",
  family: "tailwind-class-token",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
          visit: (node, sourceFile): void => {
            for (const hit of readTailwindClassTokens(node.getText())) {
              const reason = BANNED_UTILITIES[hit.utility];
              if (reason === undefined) {
                continue;
              }
              candidates.push({
                subject: ctx.relativePath(sourceFile),
                operation: operationOf(hit.utility),
                node,
                // The reported slice is the WHOLE AUTHORED TOKEN at its authored offset (`md:max-w-prose`),
                // never the ruled utility sliced out of it: a reported token must be an exact contiguous run
                // starting at the declared offset, and a variant prefix shifts that start. The RULING is
                // carried by the grant operation, which is keyed on the utility and is variant-independent.
                token: hit.token,
                offset: hit.offset,
              });
            }
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="w-fit max-w-prose px-block" />;\n' },
      expect: { count: 1, token: "max-w-prose" },
      why: "THE FOUNDING SHAPE: the ruled utility applied at a path no ruling covers. The token is the exact class, which is also the grant's operation key — a finding nobody can name centrally is the thing the reviewed-grant tier exists to prevent",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/demo/demo.tsx": 'export const G = <div className="md:max-w-prose" />;\n' },
      expect: { count: 1, token: "md:max-w-prose" },
      why: "A VARIANT PREFIX does not change the ruling — `md:max-w-prose` is the same value on the same utility at one breakpoint, and `readTailwindClassTokens` hands back the TERMINAL segment, which is what the ruling is keyed on. A reader matching the whole token against the table would read this file clean. The reported slice is still the whole authored token, because a position must start where the finding points. It also proves the `@ui` half of the population, which has no other row",
    },
    {
      mode: "source",
      files: { "packages/client/src/lib/message-bubble-class.ts": 'export const bubble = (): string => "w-fit max-w-prose rounded-card";\n' },
      expect: { count: 1, token: "max-w-prose" },
      grant: { subject: "packages/client/src/lib/message-bubble-class.ts", operation: "banned-tw-utility:max-w-prose" },
      why: "THE REVIEWED-GRANT WITNESS, carrying the bytes of the live transcript site (#1145/#1175, refused in place at `message-bubble-class.ts:25`). Conformance checks the UNGRANTED catch first, then reruns this exact fixture with the synthetic grant: one consumed, zero effective, zero alarms. That rerun is the only thing that proves the central identity this policy's real rows are written against",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/ok.tsx": 'export const G = <div className="max-w-(--reading-measure-prose)" />;\n' },
      why: "THE PRESCRIBED REPLACEMENT — the token utility the reason names. The policy would be a wall rather than a fence if the fix it prints also flagged",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/near.tsx": 'export const G = <div className="max-w-prose-wide not-max-w-prose" />;\n' },
      why: "THE EXACT-TOKEN FENCE: a class that merely CONTAINS the ruled string is a different utility. Match on `includes` instead of the terminal token's exact text and this row reds — it is the only row that dies without that fence, and the re-cut names it as an owed control",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/comment.tsx":
          '// THE TOKEN, NOT `max-w-prose` (#1175): the utility is 93-101 characters in Geist.\nexport const G = <div className="max-w-(--width-content-col)" />;\n',
      },
      why: "A COMMENT NAMING THE RULED CLASS is not an application of it, and every remaining product hit of this string on the tree is exactly that — a re-point receipt. The policy reads string LITERALS, so the comment is out of reach by construction; this row is the baseline that says so",
    },
  ],
});
