// Gate: serde-core-seal (Core-Enforcement-Deferred-Dropped.md "serde-core" row residual — "an importer
// seal on kit/png-card-chunk / the serde core, the vector-scope-derived shape"; Spine-Config-and-
// Serialization.md §"Serialization / serde core") — the PNG card-chunk engine (`@orb/kit/png-card-chunk`
// — `readCardChunk`/`writeCardChunk`/`isPng`) is a pure byte-surgery engine shared by import (read) and
// export (write); it never imports the card type. A 2026-07-17 sweep found its only real importers are
// domain/import/** and domain/export/** (+ tests) — no third domain touches it. A new importer is RED.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor } from "../contract.ts";

const PNG_CHUNK_SYMBOLS = new Set(["readCardChunk", "writeCardChunk", "isPng"]);
const PNG_CHUNK_SPECIFIER = /^@orb\/kit\/png-card-chunk(?:\/|$)/u;
const SERVER_SRC = /\/packages\/server\/src\//u;
const IMPORT_SANCTIONED = /\/packages\/server\/src\/domain\/(?:import|export)\//u;

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
    if (IMPORT_SANCTIONED.test(path)) {
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
  mustFlag: [
    {
      files: 'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n',
      at: "packages/server/src/domain/hub/x.ts",
      expect: { messageIncludes: "sanctioned serde homes" },
      why: "the PNG card-chunk engine imported outside domain/import and domain/export — a new importer",
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
      why: "import reading the card chunk — a sanctioned caller, passes",
    },
  ],
};
