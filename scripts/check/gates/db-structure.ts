// Gate: db-structure — two halves of the db schema layout discipline. (1) BARREL COMPLETENESS: every
// packages/db/src/schema/<file>.ts must be re-exported from schema/index.ts — missing means silently
// dropped from `typeof schema` (tables vanish from migrations + the query API with no error). (2)
// PRODUCER-SCHEMA MIRROR: every schema/<feature>.ts must mirror a domain/<feature>/ producer (a reserved
// cross-cutting set + documented non-domain producers are mapped); skipped when domain/ is absent.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { CheckContext, Violation } from "../harness.ts";

const SCHEMA_REL = "packages/db/src/schema";
const DOMAIN_REL = "packages/server/src/domain";
const BARREL_FILE = "index.ts";
const BARREL_SUFFIX = "/packages/db/src/schema/index.ts";
const TS_EXT_RE = /\.ts$/u;

const RESERVED_CROSS_CUTTING = new Set(["users", "audit", "custom-types", "relations"]);

const NON_DOMAIN_PRODUCERS: Readonly<Record<string, string>> = {
  "rate-limit": "packages/server/src/transport/rate-limit.ts",
  "sdk-session": "packages/server/src/infra/providers/backends/agent-sdk/session",
  "agent-principals": "packages/server/src/domain/sessions",
  gallery: "packages/server/src/domain/assets",
  poses: "packages/server/src/domain/assets",
  "character-proposals": "packages/server/src/domain/character",
};

// BASELINE RIDERS: schema born while the 0000_baseline window is open for a committed domain that
// lands later (DDL rides the squash, code follows). Each entry names its future producer; the moment
// that dir exists the entry is stale and this gate flags it.
const BASELINE_RIDER_PRODUCERS: Readonly<Record<string, string>> = {
  // crew removed 2026-07-17 — the producer domain now EXISTS (CW1-remainder), so the normal producer-mirror
  // applies (Tier-1-DB.md producer-names-the-schema).
  // automation removed 2026-07-17 — the producer domain now EXISTS (A3 global-variable slice), so the
  // normal producer-mirror applies (Tier-1-DB.md producer-names-the-schema).
  // rpg removed 2026-07-26 — the W1a stint landed `packages/server/src/domain/rpg/` (the producer domain now
  // EXISTS), so the normal producer-mirror applies (Tier-1-DB.md producer-names-the-schema). It rode this
  // entry only across W0→W1a (schema/rpg.ts landed in W0, before the domain dir).
  // roster-preset removed 2026-07-17 — the producer domain now EXISTS (RP1 leaf + verbs), so the normal
  // producer-mirror applies (Tier-1-DB.md producer-names-the-schema).
  // refinery removed 2026-08-08 (same day it landed) — R1 built `packages/server/src/domain/refinery/`
  // (the producer domain now EXISTS), so the normal producer-mirror applies. It rode this entry only
  // across R0→R1, while the engine sat behind the mandatory security pass (docs/design/refinery-r0.md).
};

function findBarrel(ctx: CheckContext): SourceFile | undefined {
  return ctx.project.getSourceFiles().find((sf) => sf.getFilePath().endsWith(BARREL_SUFFIX));
}

/** Arm 2 for ONE schema file: the producer-mirror verdict (rider staleness / missing producer). */
function mirrorViolation(ctx: CheckContext, f: string, name: string): Violation | undefined {
  const riderProducer = BASELINE_RIDER_PRODUCERS[name];
  if (riderProducer !== undefined) {
    return existsSync(join(ctx.root, riderProducer))
      ? {
          file: `${SCHEMA_REL}/${f}`,
          line: 0,
          message: `the ${name} producer (${riderProducer}) now EXISTS — its BASELINE_RIDER_PRODUCERS entry is stale; remove it so the normal producer mirror applies (Tier-1-DB.md producer-names-the-schema).`,
        }
      : undefined;
  }
  const nonDomainProducer = NON_DOMAIN_PRODUCERS[name];
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
  } catch {
    return []; // no schema dir yet (pre-Phase-3) — nothing to assert.
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
