// Gate: serde-core-seal (Core-Enforcement-Deferred-Dropped.md "serde-core" row residual — "an importer
// seal on kit/png-card-chunk / the serde core, the vector-scope-derived shape"; Spine-Config-and-
// Serialization.md §"Serialization / serde core") — the PNG card-chunk engine (`@orb/kit/png-card-chunk`
// — `readCardChunk`/`writeCardChunk`/`isPng`) is a pure byte-surgery engine shared by import (read) and
// export (write); it never imports the card type. A 2026-07-17 sweep found its only real importers are
// domain/import/** and domain/export/** (+ tests) — no third domain touches it. A new importer is RED.
//
// ARM SPLIT (this file + serde-core-seal-health.ts, family "serde-core-seal"): the occurrence check below
// is `ordinary` (ratcheted against a NEW third importer); the two-sided stale-sanction ratchet — a
// sanctioned domain that stops doing byte surgery loses its standing permission — is `hard` and lives in
// its own policy id, because that claim needs the ENTIRE declared population and must never be
// suppressible (spacing-tier-home-health's precedent).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

export const PNG_CHUNK_SYMBOLS = new Set(["readCardChunk", "writeCardChunk", "isPng"]);
export const PNG_CHUNK_SPECIFIER = /^@orb\/kit\/png-card-chunk(?:\/|$)/u;
/** The sanctioned serde homes, named individually so the health sibling can name the dead one. */
export const SANCTIONED_DOMAINS = ["import", "export"] as const;
export const DOMAIN_ROOT = "packages/server/src/domain/";
const SERVER_SRC_PREFIX = "packages/server/src/";

const MESSAGE =
  'the PNG card-chunk engine (@orb/kit/png-card-chunk) imported outside the sanctioned serde homes — it is shared byte surgery for domain/import (read) and domain/export (write) only (Core-Enforcement-Deferred-Dropped.md "serde-core"; Spine-Config-and-Serialization.md §Serialization/serde core).';

/** Is this ImportSpecifier a card-chunk engine symbol imported from `@orb/kit/png-card-chunk`? Exported for
 *  the health sibling, which re-derives the same import identity independently. */
export function pngChunkImport(node: Node): string {
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

export const gate = defineGate({
  id: "serde-core-seal",
  family: "serde-core-seal",
  authority: "ordinary",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "domain/import (read) and domain/export (write) are the only sanctioned callers of the PNG card-chunk engine — route through one of those, never a new direct importer.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.ImportSpecifier],
        visit: (node, sourceFile) => {
          const path = ctx.relativePath(sourceFile);
          if (!path.startsWith(SERVER_SRC_PREFIX) || SANCTIONED_DOMAINS.some((d) => path.startsWith(`${DOMAIN_ROOT}${d}/`))) {
            return;
          }
          const symbol = pngChunkImport(node);
          if (symbol !== "") {
            ctx.report.node(node, { token: symbol, offset: 0 });
          }
        },
      },
    ],
  }),

  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/x.ts": 'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n',
      },
      expect: { messageIncludes: "sanctioned serde homes" },
      why: "the PNG card-chunk engine imported outside domain/import and domain/export — a new importer",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/export/verbs/x.ts": 'import { writeCardChunk } from "@orb/kit/png-card-chunk";\nexport const w = writeCardChunk;\n',
      },
      why: "export writing the card chunk — a sanctioned caller, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/import/substrate/y.ts":
          'import { readCardChunk, isPng } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\nexport const p = isPng;\n',
      },
      why: "import reading the card chunk — a sanctioned caller, passes",
    },
  ],
});
