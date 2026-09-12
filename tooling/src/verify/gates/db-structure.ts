// Gate: db-structure — two halves of the db schema layout discipline. (1) BARREL COMPLETENESS: every
// packages/db/src/schema/<file>.ts must be re-exported from schema/index.ts — missing means silently
// dropped from `typeof schema` (tables vanish from migrations + the query API with no error). (2)
// PRODUCER-SCHEMA MIRROR: every schema/<feature>.ts must mirror a domain/<feature>/ producer (a reserved
// cross-cutting set + documented non-domain producers are mapped); skipped when domain/ is absent.
//
// THE BASELINE-RIDER TABLE IS GONE (authority census C1, #1922; deleted 2026-09-12). `BASELINE_RIDER_PRODUCERS`
// exempted a schema file born while the `0000_baseline` squash window was open for a domain that had not
// landed yet, and its stale arm red the moment the named producer directory appeared. It has been EMPTY
// since 2026-08-08 — all five riders (crew, automation, rpg, roster-preset, refinery) burned down as their
// producer domains landed, each recorded in the table's own comments — so the arm iterated nothing and the
// rider branch in `mirrorViolation` was unreachable. Both are gone; `NON_DOMAIN_PRODUCERS` (6 live rows) is
// a DIFFERENT artifact and stays. A future rider is a central reviewed grant, never a re-minted table.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import type { ExemptionRow, ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import type { CheckContext, Violation } from "../contract/harness.ts";

const SCHEMA_REL = "packages/db/src/schema";
const DOMAIN_REL = "packages/server/src/domain";
const BARREL_FILE = "index.ts";
const BARREL_SUFFIX = "/packages/db/src/schema/index.ts";
const TS_EXT_RE = /\.ts$/u;

const RESERVED_CROSS_CUTTING = new Set(["users", "audit", "custom-types", "relations"]);

/** A producer row: the PATH that owns the schema file, plus (ExemptionTable's mandatory) why. The path is
 *  DATA, not prose — the legacy `Record<string, string>` spelling made the two indistinguishable, which is
 *  exactly the failure `ExemptionRow` intersections exist to prevent (GATE-AUTHORING.md §4.1). */
type ProducerRow = ExemptionRow & { readonly producer: string };

const NON_DOMAIN_PRODUCERS: ExemptionTable<ProducerRow> = {
  "rate-limit": {
    producer: "packages/server/src/transport/rate-limit.ts",
    why: "transport owns the limiter's rows — there is no `domain/rate-limit`, and there should not be (Tier-4-Transport.md). Ends if the limiter re-homes into a domain",
  },
  "sdk-session": {
    producer: "packages/server/src/infra/providers/backends/agent-sdk/session",
    why: "the agent-sdk session cache is backend-INTERNAL (D8) — a chat concern would be the tier collapse the ledger forbids. Ends if the cache leaves infra",
  },
  "agent-principals": {
    producer: "packages/server/src/domain/sessions",
    why: "agent principals are identity (D60) and sessions is the identity domain; the DDL is dormant until the mint is built. Ends when a `domain/agent-principals` exists",
  },
  gallery: {
    producer: "packages/server/src/domain/assets",
    why: "the gallery verbs live in `domain/assets` (the CAS index owns its own presentation rows) — there is no `domain/gallery`. Ends if gallery becomes its own domain",
  },
  poses: {
    producer: "packages/server/src/domain/assets",
    why: "poses are asset rows with an expression key, produced by the same domain. Same end condition",
  },
  "character-proposals": {
    producer: "packages/server/src/domain/character",
    why: "a proposal is a character-domain row (the snapshot/proposal log, D28) — the file is named for the table, not for a second domain. Ends if proposals re-home",
  },
};

function findBarrel(ctx: CheckContext): SourceFile | undefined {
  return ctx.project.getSourceFiles().find((sf) => sf.getFilePath().endsWith(BARREL_SUFFIX));
}

/** Arm 2 for ONE schema file: the producer-mirror verdict (the schema file has no producer). */
function mirrorViolation(ctx: CheckContext, f: string, name: string): Violation | undefined {
  const nonDomainProducer = NON_DOMAIN_PRODUCERS[name]?.producer;
  const producerPath = nonDomainProducer === undefined ? join(ctx.root, DOMAIN_REL, name) : join(ctx.root, nonDomainProducer);
  return existsSync(producerPath)
    ? undefined
    : {
        file: `${SCHEMA_REL}/${f}`,
        line: 0,
        message: `schema file has NO producer (${nonDomainProducer ?? `${DOMAIN_REL}/${name}/`} does not exist) — a schema file is named for the domain that PRODUCES its rows, never a consumer (Tier-1-DB.md producer-names-the-schema; PD-92). Rename it to its producer, or add it to the documented reserved/non-domain sets in this gate.`,
      };
}

/** The fs+AST scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanDbStructure(ctx: CheckContext): Violation[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(join(ctx.root, SCHEMA_REL));
  } catch (error) {
    // ENOENT is the ONE benign case: the schema dir genuinely does not exist (a pre-Phase snapshot / a
    // conformance mini-project with no db package) — nothing to assert. Every OTHER failure (EACCES, ENOTDIR,
    // a broken symlink) means this gate could not READ a dir that is a live, always-present part of the tree:
    // a checker that BROKE is not a clean verdict, so it REFUSES as a tool-error (exit 2, the harness turns a
    // throw from `run` into a per-gate ToolError) rather than swallowing the failure into a false ✓.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return []; // schema dir genuinely absent — nothing to assert.
    }
    throw error;
  }
  const files = entries.filter((f) => f.endsWith(".ts") && f !== BARREL_FILE);
  if (files.length === 0) {
    return [];
  }
  const barrel = findBarrel(ctx);
  if (barrel === undefined) {
    return [
      {
        file: `${SCHEMA_REL}/${BARREL_FILE}`,
        line: 0,
        message: "the schema barrel index.ts is missing — every schema file must be re-exported from it (Tier-1-DB.md).",
      },
    ];
  }
  const reExported = new Set(
    barrel
      .getExportDeclarations()
      .map((d) => d.getModuleSpecifierValue())
      .filter((s): s is string => s !== undefined),
  );
  const violations: Violation[] = [];
  const domainRoot = join(ctx.root, DOMAIN_REL);
  const checkMirror = existsSync(domainRoot); // pre-Phase-4 snapshots have no domain/ tree — skip arm 2.
  for (const f of files) {
    const name = f.replace(TS_EXT_RE, "");
    // BOTH spellings are accepted: `./name` (the pre-2026-08-03 convention) and `./name.ts` (the current
    // one — the tsx-shedding migration made every relative import extension-ful, because node's type
    // stripping does no extensionless resolution). A matcher pinned to one spelling reports 27 phantom
    // "missing" re-exports the moment the barrel is rewritten, which is exactly what it did.
    const spec = `./${name}`;
    const reExportedHere = reExported.has(spec) || reExported.has(`${spec}.ts`);
    if (!reExportedHere) {
      violations.push({
        file: `${SCHEMA_REL}/${f}`,
        line: 0,
        message: `schema file is NOT re-exported from the barrel schema/index.ts — add \`export * from "${spec}.ts";\` or its tables silently vanish from \`typeof schema\` (migrations + the relational query API).`,
      });
    }
    if (!checkMirror || RESERVED_CROSS_CUTTING.has(name)) {
      continue;
    }
    const mirror = mirrorViolation(ctx, f, name);
    if (mirror !== undefined) {
      violations.push(mirror);
    }
  }
  return violations;
}

export const gate: GateDescriptor = {
  name: "db-structure",
  docRow: "Tier-1-DB.md",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a schema file is not re-exported from the barrel schema/index.ts (or the barrel is missing) — every schema file must be re-exported or its tables silently vanish from `typeof schema` (Tier-1-DB.md).",
  fix: 'add `export * from "./<name>";` to packages/db/src/schema/index.ts (or create the barrel).',
  run: (ctx) => {
    for (const v of scanDbStructure(ctx)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/db/src/schema/orphan.ts": "export const t = 1;\n",
        "packages/db/src/schema/index.ts": "export const barrel = 1;\n",
      },
      expect: { messageIncludes: "NOT re-exported" },
      why: "a schema file not re-exported from the barrel — its tables vanish from `typeof schema` (Tier-1)",
    },
    {
      files: {
        "packages/db/src/schema/thing.ts": "export const t = 1;\n",
      },
      expect: { messageIncludes: "the schema barrel index.ts is missing" },
      why: "a schema file present with NO barrel index.ts at all — the barrel-absent arm",
    },
    {
      files: {
        "packages/db/src/schema/nowhere.ts": "export const t = 1;\n",
        "packages/db/src/schema/index.ts": 'export * from "./nowhere";\n',
        // domain/ must EXIST for the mirror arm to run; a sibling feature makes existsSync(domainRoot) true.
        "packages/server/src/domain/other/index.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "has NO producer" },
      why: "a re-exported schema file named for no domain producer (no domain/nowhere/) — the PD-92 producer-mirror arm",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/schema/thing.ts": "export const t = 1;\n",
        "packages/db/src/schema/index.ts": 'export * from "./thing";\n',
      },
      why: "the schema file is re-exported from the barrel — the sanctioned shape, passes",
    },
  ],
};
