// Gate: serde-core-seal — an importer seal on kit/png-card-chunk / the serde core, the vector-scope-derived
// shape (Spine-Config-and-Serialization.md §"Serialization / serde core") — the PNG card-chunk engine (`@orb/kit/png-card-chunk`
// — `readCardChunk`/`writeCardChunk`/`isPng`) is a pure byte-surgery engine shared by import (read) and
// export (write); it never imports the card type. A 2026-07-17 sweep found its only real importers are
// domain/import/** and domain/export/** (+ tests) — no third domain touches it. A new importer is RED.
//
// ARM SPLIT (this file + serde-core-seal-health.ts, family "serde-core-seal"): the occurrence check below
// is `ordinary` (ratcheted against a NEW third importer); the two-sided stale-sanction ratchet — a
// sanctioned domain that stops doing byte surgery loses its standing permission — is `hard` and lives in
// its own policy id, because that claim needs the ENTIRE declared population and must never be
// suppressible (spacing-tier-home-health's precedent).
//
// FAMILY "serde-core-seal": a REAL two-policy family, and the shared reader is
// `lib/serde-core-seal.ts#pngChunkImport`, imported by BOTH halves — so both arms judge one import identity
// and cannot drift apart.
//
// THIS SENTENCE USED TO CITE A PRECEDENT THAT NOW SAYS THE OPPOSITE (#2177). It read: "the shared reader is
// `pngChunkImport` exported from this module and imported by the health sibling — the
// no-raw-spacing-in-features / SANCTIONED_HOMES precedent". That precedent was REVERSED by the commit that
// moved the spacing family's table into `lib/raw-spacing-tier.ts` under the same #2096 ruling, and the
// commit which falsified it is the one that left this module fenced — so a live comment spent a day citing
// a dead arrangement as its justification. Recorded rather than quietly swapped, because "a citation can be
// falsified by the very commit that is required to leave it alone" is the failure mode, not the typo.
//
// POPULATION: `@server`, whole — the seal is about who imports, and every server tier can. The three narrowings below are all
// carrier fences and each has a mustPass row that dies without it: the `packages/server/src/` + sanctioned-
// domain prefix test (mustPass[0]/[1]), and the card-chunk SYMBOL set plus the module SPECIFIER (mustPass[2]).
//
// The legacy `serde-core-seal` descriptor (534c1327f682be2578e1dee7c7a2bfa488fb672a) carried BOTH the
// occurrence check and the stale-sanction ratchet as one gate before this conversion split them.
//
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot` was `/\/packages\/server\/src\//u` over `/${p}`,
// which is exactly `@server`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 1,493 admitted on both sides, symmetric difference ZERO in both directions.
// SHA FORM NOTE: the legacy sha is the bare 40-char spelling in the paragraph above rather than the
// `(<sha>^)` form; it names this conversion's parent directly, so both spellings resolve to one commit.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `serde-core-seal` descriptor at 534c1327f682be2578e1dee7c7a2bfa488fb672a, the parent of the conversion `bd56189ba`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,358 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,493
// and final `population` admits 1,493. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/domain/admin/__cbbhr_in_context.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { DOMAIN_ROOT, pngChunkImport, SANCTIONED_DOMAINS } from "../lib/serde-core-seal.ts";

const SERVER_SRC_PREFIX = "packages/server/src/";

const MESSAGE =
  "the PNG card-chunk engine (@orb/kit/png-card-chunk) imported outside the sanctioned serde homes — it is shared byte surgery for domain/import (read) and domain/export (write) only (Spine-Config-and-Serialization.md §Serialization/serde core).";

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
  fix: "domain/import (read) and domain/export (write) are the only sanctioned callers of the PNG card-chunk engine — route through one of those, never a new direct importer. A reviewed third home waives that exact occurrence with `@orb-waive serde-core-seal(<symbol>): <reason + end condition>`, where `<symbol>` is the IMPORTED ENGINE SYMBOL (`readCardChunk` / `writeCardChunk` / `isPng`) the report passes as its token — never the module specifier and never the local alias it is renamed to.",
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
      expect: { count: 1, token: "readCardChunk" },
      why: "the PNG card-chunk engine imported outside domain/import and domain/export — a new importer. Count 1 pins that only the ImportSpecifier is the finding, not the value reference on the next line; the token pins WHICH node, which `messageIncludes` could not (this module emits exactly one message, so a message assertion discriminates nothing)",
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
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/symbols.ts":
          'import { encodeCard } from "@orb/kit/png-card-chunk";\nimport { readCardChunk } from "@orb/kit/other-engine";\nexport const e = encodeCard;\nexport const r = readCardChunk;\n',
      },
      why: "BOTH IDENTITY FENCES, pinned in one unsanctioned home: a NON-engine symbol from the sealed module, and an engine-NAMED symbol from a different module. Deleting either the PNG_CHUNK_SYMBOLS test or the PNG_CHUNK_SPECIFIER test reds this row while every founding row stays green — the seal is the pair (symbol, specifier), not one of them",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/hub/waived.ts":
          '// @orb-waive serde-core-seal(readCardChunk): the proof stand-in reason; ends when this fixture stops flagging.\nimport { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const r = readCardChunk;\n',
      },
      why: "POSITIONAL IDENTITY: the report passes the IMPORTED SYMBOL as its token at offset 0 of the ImportSpecifier, so an author waives `readCardChunk` — not the module specifier the message names and not the value reference below. The marker sits above the ImportDeclaration, which is the finding's enclosing statement carrier. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
