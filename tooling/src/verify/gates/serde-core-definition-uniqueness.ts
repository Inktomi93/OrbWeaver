// Gate: serde-core-definition-uniqueness (#2383) — ensures `cardContentHash`, `cardFromJson`, and
// `buildCardV3` each have exactly ONE `export function` declaration across the server package. The
// existing `serde-core-seal` only covers the PNG card-chunk symbols; these three serde-core functions
// are the CARD mapper layer above it. A second declaration would be a fork that silently diverges on
// round-trip (the import/export pipeline uses whichever is closer in the module graph).
//
// Today all three live in ONE file: `packages/server/src/kit/serde/card/index.ts`. The gate proves
// that no other file declares any of them.
//
// DETECTION: syntax-tier regex on blanked text. Matches `export function <name>` or
// `export const <name>` — the two declaration forms. Comment-blanked to avoid matching header comments
// that name the functions. Scoped to `@server` because the server package owns the serde core.
//
// FAMILY: a declared SINGLETON under its own id. The `serde-core-seal` family guards the PNG engine
// IMPORTERS; this guards the MAPPER DECLARATIONS — different subjects, no shared reader.
import { defineGate } from "../contract/policy.ts";
import { blankTsComments } from "../lib/comment-spans.ts";

const SERDE_SYMBOLS = ["cardContentHash", "cardFromJson", "buildCardV3"] as const;

// Matches `export function <name>` or `export const <name>` — the two declaration forms.
function makeRe(name: string): RegExp {
  return new RegExp(`\\bexport\\s+(?:function|const)\\s+${name}\\b`, "u");
}
const SERDE_RES = SERDE_SYMBOLS.map((name) => ({ name, re: makeRe(name) }));

// The ONE sanctioned home for all three declarations.
const CANONICAL_HOME = "packages/server/src/kit/serde/card/index.ts";

const MESSAGE =
  "a SECOND declaration of a serde-core card mapper function (cardContentHash / cardFromJson / buildCardV3) — each must have exactly ONE `export function` / `export const` in the server package. The canonical home is `kit/serde/card/index.ts`.";

export const gate = defineGate({
  id: "serde-core-definition-uniqueness",
  family: "serde-core-definition-uniqueness",
  authority: "hard",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use the canonical declaration from `@orb/server/kit/serde/card` instead of declaring a second. If the canonical home needs a new overload, add it there.",
  create: (ctx) => ({
    visitFile: (sf) => {
      const raw = sf.getFullText();
      const file = ctx.relativePath(sf);
      // The canonical home IS allowed to declare them — skip it.
      if (file === CANONICAL_HOME) {
        return;
      }
      // Candidate fence: skip files that don't mention any of the symbols.
      if (!SERDE_SYMBOLS.some((name) => raw.includes(name))) {
        return;
      }
      const blanked = blankTsComments(sf);
      for (const [index, line] of blanked.split("\n").entries()) {
        for (const { name, re } of SERDE_RES) {
          if (re.test(line)) {
            ctx.report.file(file, {
              line: index + 1,
              column: 1,
              token: name,
              message: `second declaration of \`${name}\` — the canonical home is \`${CANONICAL_HOME}\`.`,
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
        // A SECOND declaration of cardFromJson outside the canonical home.
        "packages/server/src/domain/import/substrate/dup.ts": "export function cardFromJson(raw: unknown): unknown { return raw; }\n",
        // The canonical home must also exist so the population is nonempty.
        "packages/server/src/kit/serde/card/index.ts":
          "export function cardFromJson(raw: unknown, fallbackName: string): unknown { return raw; }\nexport function cardContentHash(): string { return ''; }\nexport function buildCardV3(): unknown { return {}; }\n",
      },
      expect: { count: 1, token: "cardFromJson" },
      why: "a second declaration of cardFromJson outside the canonical home — the exact fork surface this gate prevents",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        // Only the canonical home declares the symbol — no second declaration exists.
        "packages/server/src/kit/serde/card/index.ts":
          "export function cardFromJson(raw: unknown, fallbackName: string): unknown { return raw; }\nexport function cardContentHash(): string { return ''; }\nexport function buildCardV3(): unknown { return {}; }\n",
        // A file that IMPORTS cardFromJson is not a declaration.
        "packages/server/src/domain/import/substrate/user.ts": 'import { cardFromJson } from "#kit/serde/card";\nexport const x = cardFromJson;\n',
      },
      why: "a file that imports cardFromJson is NOT a declaration — only `export function`/`export const` matches",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/kit/serde/card/index.ts":
          "export function cardFromJson(raw: unknown, fallbackName: string): unknown { return raw; }\nexport function cardContentHash(): string { return ''; }\nexport function buildCardV3(): unknown { return {}; }\n",
        // A comment naming the function is not a declaration.
        "packages/server/src/domain/import/substrate/comment.ts": "// Uses cardFromJson from kit/serde/card.\nexport const x = 1;\n",
      },
      why: "a comment naming cardFromJson is blanked and does not match — the comment projection excludes prose",
    },
  ],
});
