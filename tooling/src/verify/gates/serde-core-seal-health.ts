// Policy: serde-core-seal-health — the TWO-SIDED stale-sanction ratchet for the sibling `serde-core-seal`
// gate (family "serde-core-seal", shared verbatim). The sanction is a claim about who does byte surgery on
// the PNG card-chunk engine; when a sanctioned domain (import/export) no longer imports ANY card-chunk
// symbol, the claim behind its permission is dead and the row is a standing permission nobody uses. The
// arm self-guards on a REAL-TREE ANCHOR (GATE-AUTHORING.md §4.5): the kit module that DEFINES the engine.
//
// The legacy `serde-core-seal` descriptor (534c1327f682be2578e1dee7c7a2bfa488fb672a) carried this
// stale-sanction check as one arm of a single gate before this conversion split it out here.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { DOMAIN_ROOT, pngChunkImport, SANCTIONED_DOMAINS } from "./serde-core-seal.ts";

/** Real-tree anchor: the kit module that DEFINES the byte-surgery engine. Also the report anchor, since a
 *  finding must land inside this policy's own declared population. */
const ANCHOR = "packages/kit/src/index.ts";

const STALE_PREFIX =
  "stale sanctioned serde home — this domain imports NO card-chunk symbol any more, so the byte-surgery " +
  "claim behind its permission is dead (ratchet down): ";

export const gate = defineGate({
  id: "serde-core-seal-health",
  family: "serde-core-seal",
  authority: "hard",
  severity: "error",
  population: ["@server", "@kit"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message:
    "a sanctioned serde home (domain/import or domain/export) no longer imports any PNG card-chunk symbol — the byte-surgery claim behind its permission is dead.",
  create: (ctx) => {
    const sanctionedHasSymbol = new Map<string, boolean>(SANCTIONED_DOMAINS.map((d) => [d, false]));
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node, sourceFile) => {
            const path = ctx.relativePath(sourceFile);
            const domain = SANCTIONED_DOMAINS.find((d) => path.startsWith(`${DOMAIN_ROOT}${d}/`));
            if (domain === undefined) {
              return;
            }
            if (pngChunkImport(node) !== "") {
              sanctionedHasSymbol.set(domain, true);
            }
          },
        },
      ],
      evaluate: () => {
        if (!ctx.files.some((sf) => ctx.relativePath(sf) === ANCHOR)) {
          return;
        }
        for (const domain of SANCTIONED_DOMAINS) {
          if (sanctionedHasSymbol.get(domain) !== true) {
            ctx.report.file(ANCHOR, {
              line: 1,
              message: `${STALE_PREFIX}"${domain}" — delete the row in tooling/src/verify/gates/serde-core-seal.ts`,
            });
          }
        }
      },
    };
  },

  mustFlag: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export const kit = {};\n",
        "packages/server/src/domain/export/verbs/export-character.ts":
          'import { writeCardChunk } from "@orb/kit/png-card-chunk";\nexport const w = writeCardChunk;\n',
      },
      expect: { count: 1, messageIncludes: '"import"' },
      why: "THE STALE ARM: the anchor (the engine's kit home) is loaded; export still does byte surgery and keeps its permission, import does none — that row's claim is dead and ratchets down. `messageIncludes` pins WHICH sanctioned domain is accused, and it is load-bearing rather than decoration: both arms of this policy anchor on the same `ANCHOR:1` and differ ONLY in the quoted domain, so a bare `{ count: 1 }` passed identically when the message was patched to name the OPPOSITE domain (measured 2026-09-12, cb-v-unaudited-finals L5). The two messages are disjoint on the quoted string, which is what makes this assertion discriminate",
    },
    {
      mode: "source",
      files: {
        [ANCHOR]: "export const kit = {};\n",
        "packages/server/src/domain/export/verbs/export-character.ts":
          'import { writeCardChunk } from "@orb/kit/png-card-chunk";\nexport const w = writeCardChunk;\n',
        "packages/server/src/domain/import/substrate/card.ts": 'import { characters } from "@orb/db";\nexport const c = characters;\n',
      },
      expect: { count: 1, messageIncludes: '"import"' },
      why: 'THE BYTE-SURGERY IDENTITY FENCE: the import home is alive and importing — just not the engine. A sanctioned home keeps its permission for doing BYTE SURGERY, not for existing, so an unrelated import must not re-earn the row. Opening `pngChunkImport(node) !== ""` to `true` makes any ImportSpecifier in a sanctioned home count, this row drops to 0 findings and reds. Without it no row had a sanctioned domain importing something unrelated, which is the whole premise of "the claim behind its permission is dead" (cb-v-unaudited-finals L6)',
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export const kit = {};\n",
        "packages/server/src/domain/export/verbs/export-character.ts":
          'import { writeCardChunk } from "@orb/kit/png-card-chunk";\nexport const w = writeCardChunk;\n',
        "packages/server/src/domain/import/substrate/card.ts": 'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n',
      },
      why: "both serde homes STILL EARNED, judged against the real-tree anchor: each does live byte surgery, so neither arm fires",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/import/substrate/y.ts": "export const clean = true;\n" },
      why: "the anchor is not loaded (a plain fixture run) — the tripwire self-guards off, never claiming both homes dead",
    },
  ],
});
