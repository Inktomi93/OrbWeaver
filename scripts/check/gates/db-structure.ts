// Gate: db-structure — the two halves of the db schema layout discipline (Core-Laws-and-Precedents.md
// "db-structure"; core/Tier-1-DB.md "producer-names-the-schema rule").
//   1. BARREL COMPLETENESS: every `packages/db/src/schema/<file>.ts` MUST be re-exported from the barrel
//      `schema/index.ts` — a schema file missing from the barrel is silently dropped from `typeof schema`
//      (its tables vanish from migrations AND the drizzle relational query API with NO error).
//   2. PRODUCER-SCHEMA MIRROR (PD-92 — activated now that the `domain/` tree exists): every
//      `schema/<feature>.ts` MUST mirror a `packages/server/src/domain/<feature>/` producer — the half
//      that catches consumer-named lies (the retired neo `search.ts`/`corpus.ts`, named for READERS).
//      Tier-1-DB.md sanctions a reserved cross-cutting set (`users` · `audit` · `custom-types` ·
//      `relations`) plus two documented non-domain producers: `rate-limit` (transport/rate-limit, D35)
//      and `sdk-session` (the agent-sdk backend session store, D8/D25) — each mapped to its real
//      producer path and checked for existence. The mirror arm is skipped when `domain/` is absent
//      (pre-Phase-4 snapshots stay checkable).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import type { Check, CheckContext, Violation } from "../harness.ts";

const SCHEMA_REL = "packages/db/src/schema";
const DOMAIN_REL = "packages/server/src/domain";
const BARREL_FILE = "index.ts";
const BARREL_SUFFIX = "/packages/db/src/schema/index.ts";
const TS_EXT_RE = /\.ts$/u;

/** The Tier-1-DB.md reserved cross-cutting schema files — no `domain/<name>` producer expected. */
const RESERVED_CROSS_CUTTING = new Set(["users", "audit", "custom-types", "relations"]);

/** Documented NON-domain producers (name → the producer path that must exist, relative to root). */
const NON_DOMAIN_PRODUCERS: Readonly<Record<string, string>> = {
  // rate_limit_buckets — producer transport/rate-limit (D35; the one sanctioned transport db primitive).
  "rate-limit": "packages/server/src/transport/rate-limit.ts",
  // session_entries — producer = the sealed agent-sdk backend session store (D8/D25), not a domain.
  "sdk-session": "packages/server/src/infra/providers/backends/agent-sdk/session",
  // agent_principals — producer = domain/sessions (provisionAgentPrincipal mints the users + satellite rows
  // in one batch, D60/agent-principal-design/01 §4); the satellite is a sessions-produced registry, not its
  // own domain. Born at AP0; the mint verb lands AP1 (FLAG[PD-17]).
  "agent-principals": "packages/server/src/domain/sessions",
  // gallery_items — producer = domain/assets (gallery is NOT a domain, D49 item 2 / gallery-design §0; the
  // addToGallery/removeFromGallery/listGallery verbs live in domain/assets). Curated per-character media (v2).
  gallery: "packages/server/src/domain/assets",
  // card_evolution_proposals — producer = domain/character (D59; chat-crew-design/02 §5: the proposal
  // lifecycle verbs are character's — the crew only FILES through the injected op). A sibling file, not a
  // character.ts resident, because its `chats` FK would cycle character.ts ↔ chat.ts (noImportCycles).
  "character-proposals": "packages/server/src/domain/character",
};

/** Decide-before-launch BASELINE RIDERS: schema born while the `0000_baseline` window is open for a
 *  COMMITTED domain that lands later (the D58 economics — DDL rides the squash, code follows). Each
 *  entry names its future producer; the moment that dir exists the entry is STALE and this gate says
 *  so — the exemption cannot outlive its reason. */
const BASELINE_RIDER_PRODUCERS: Readonly<Record<string, string>> = {
  // crew_chats/crew_plots/crew_edit_proposals/crew_guides — producer = domain/crew (D59; lands at
  // chat-crew-design/08 CW1).
  crew: "packages/server/src/domain/crew",
  // automation_rules/automation_budgets/automation_fires/global_variables — producer =
  // domain/automation (D46; lands Phase 8, automation-design/04).
  automation: "packages/server/src/domain/automation",
  // roster_presets/roster_preset_members — producer = domain/roster-preset (D61; lands at
  // saved-rosters-design RP1).
  "roster-preset": "packages/server/src/domain/roster-preset",
  // character_sprites — producer = domain/expressions (D49 #4; lands at expressions-design E2).
  expressions: "packages/server/src/domain/expressions",
  // documents + the 3 scope junctions — producer = domain/databank (D49 #5; lands at DB2 proper).
  // (document_chunks rides schema/embeddings.ts — the vector-substrate home — so it is NOT here.)
  databank: "packages/server/src/domain/databank",
  // the 14 rpg campaign tables — producer = domain/rpg (D58; lands at rpg-design/10 R1-proper).
  rpg: "packages/server/src/domain/rpg",
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
  const producerPath =
    nonDomainProducer === undefined
      ? join(ctx.root, DOMAIN_REL, name)
      : join(ctx.root, nonDomainProducer);
  return existsSync(producerPath)
    ? undefined
    : {
        file: `${SCHEMA_REL}/${f}`,
        line: 0,
        message: `schema file has NO producer (${nonDomainProducer ?? `${DOMAIN_REL}/${name}/`} does not exist) — a schema file is named for the domain that PRODUCES its rows, never a consumer (Tier-1-DB.md producer-names-the-schema; PD-92). Rename it to its producer, or add it to the documented reserved/non-domain sets in this gate.`,
      };
}

export const dbStructure: Check = {
  name: "db-structure",
  run: (ctx): Violation[] => {
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
          message:
            "the schema barrel index.ts is missing — every schema file must be re-exported from it (Tier-1-DB.md).",
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
      const spec = `./${name}`;
      if (!reExported.has(spec)) {
        violations.push({
          file: `${SCHEMA_REL}/${f}`,
          line: 0,
          message: `schema file is NOT re-exported from the barrel schema/index.ts — add \`export * from "${spec}";\` or its tables silently vanish from \`typeof schema\` (migrations + the relational query API).`,
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
  },
};
