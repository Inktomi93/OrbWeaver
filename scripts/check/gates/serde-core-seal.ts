// Gate: serde-core-seal (Core-Enforcement-Deferred-Dropped.md "serde-core" row residual — "an importer
// seal on kit/png-card-chunk / the serde core, the vector-scope-derived shape"; Spine-Config-and-
// Serialization.md §"Serialization / serde core") — the PNG card-chunk engine (`@orb/kit/png-card-chunk`
// — `readCardChunk`/`writeCardChunk`/`isPng`) is a pure byte-surgery engine shared by import (read) and
// export (write); it never imports the card type. A 2026-07-17 sweep found its only real importers are
// domain/import/** and domain/export/** (+ tests) — no third domain touches it. A new importer is RED.
//
// TWO-SIDED (gate-hub #10): the seal ratchets DOWN — a sanctioned domain that imports NO card-chunk symbol
// any more is RED. The sanction is a claim about who does byte surgery; when a domain stops, the claim is
// stale and the row is just a standing permission. The arm self-guards on a REAL-TREE ANCHOR (gate-hub #11):
// the kit module that DEFINES the engine.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const PNG_CHUNK_SYMBOLS = new Set(["readCardChunk", "writeCardChunk", "isPng"]);
const PNG_CHUNK_SPECIFIER = /^@orb\/kit\/png-card-chunk(?:\/|$)/u;
const SERVER_SRC = /\/packages\/server\/src\//u;
/** The sanctioned serde homes, named individually so the stale arm can name the dead one. */
const SANCTIONED_DOMAINS = ["import", "export"] as const;
const DOMAIN_ROOT = "packages/server/src/domain/";

const GATE_SELF = "scripts/check/gates/serde-core-seal.ts";
/** Real-tree anchor (gate-hub #11): the kit module that DEFINES the byte-surgery engine. */
const ANCHOR = "packages/kit/src/index.ts";
const STALE_PREFIX =
  "stale sanctioned serde home — this domain imports NO card-chunk symbol any more, so the byte-surgery " +
  "claim behind its permission is dead (ratchet down): ";

const MESSAGE =
  'the PNG card-chunk engine (@orb/kit/png-card-chunk) imported outside the sanctioned serde homes — it is shared byte surgery for domain/import (read) and domain/export (write) only (Core-Enforcement-Deferred-Dropped.md "serde-core"; Spine-Config-and-Serialization.md §Serialization/serde core).';

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Is this ImportSpecifier a card-chunk engine symbol imported from @orb/kit/png-card-chunk? */
function pngChunkImport(node: Node): string {
  if (!node.isKind(SyntaxKind.ImportSpecifier)) {
    return "";
  }
  const name = node.getName();
  if (!PNG_CHUNK_SYMBOLS.has(name)) {
    return "";
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl !== undefined && PNG_CHUNK_SPECIFIER.test(decl.getModuleSpecifierValue()) ? name : "";
}

export const gate: GateDescriptor = {
  name: "serde-core-seal",
  docRow: 'Core-Enforcement-Deferred-Dropped.md "serde-core" row residual',
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "domain/import (read) and domain/export (write) are the only sanctioned callers of the PNG card-chunk engine — route through one of those, never a new direct importer.",
  scanRoot: (p) => SERVER_SRC.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();
    if (SANCTIONED_DOMAINS.some((d) => path.includes(`${DOMAIN_ROOT}${d}/`))) {
      return;
    }
    const symbol = pngChunkImport(node);
    if (symbol === "") {
      return;
    }
    const finding: Finding = {
      file: relPath(ctx.root, sf.getFilePath()),
      line: node.getStartLineNumber(),
      column: sf.getLineAndColumnAtPos(node.getStart()).column,
      message: MESSAGE,
      token: symbol,
    };
    ctx.report(finding);
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    for (const domain of SANCTIONED_DOMAINS) {
      const prefix = `${ctx.root}/${DOMAIN_ROOT}${domain}/`;
      const imports = ctx.project
        .getSourceFiles()
        .filter((sf) => sf.getFilePath().startsWith(prefix))
        .some((sf) => sf.getDescendantsOfKind(SyntaxKind.ImportSpecifier).some((spec) => pngChunkImport(spec) !== ""));
      if (!imports) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}"${domain}" — delete the row in scripts/check/gates/serde-core-seal.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n',
      at: "packages/server/src/domain/hub/x.ts",
      expect: { messageIncludes: "sanctioned serde homes" },
      why: "the PNG card-chunk engine imported outside domain/import and domain/export — a new importer",
    },
    {
      files: {
        [ANCHOR]: "export const kit = {};\n",
        "packages/server/src/domain/export/verbs/export-character.ts":
          'import { writeCardChunk } from "@orb/kit/png-card-chunk";\nexport const w = writeCardChunk;\n',
      },
      expect: { count: 1, messageIncludes: "stale sanctioned serde home" },
      why: "THE STALE ARM: the anchor (the engine's kit home) is loaded; export still does byte surgery and keeps its permission, import does none — that row's claim is dead and ratchets down",
    },
  ],
  mustPass: [
    {
      files: 'import { writeCardChunk } from "@orb/kit/png-card-chunk";\nexport const w = writeCardChunk;\n',
      at: "packages/server/src/domain/export/verbs/x.ts",
      why: "export writing the card chunk — a sanctioned caller, passes",
    },
    {
      files: 'import { readCardChunk, isPng } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\nexport const p = isPng;\n',
      at: "packages/server/src/domain/import/substrate/y.ts",
      why: "import reading the card chunk — a sanctioned caller, passes; with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export const kit = {};\n",
        "packages/server/src/domain/export/verbs/export-character.ts":
          'import { writeCardChunk } from "@orb/kit/png-card-chunk";\nexport const w = writeCardChunk;\n',
        "packages/server/src/domain/import/substrate/card.ts": 'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n',
      },
      why: "both serde homes STILL EARNED, judged against the real-tree anchor: each does live byte surgery, so neither arm fires",
    },
  ],
};
