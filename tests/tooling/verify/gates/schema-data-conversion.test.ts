// Frozen differential for the six schema/data descriptors converted at #1584. Every legacy mustFlag and
// mustPass row at 4522eee58 is replayed before the final policy union. Canonical imports/resource roots are
// added only to let the shared readers resolve; each completion is proven inert on the frozen verdict.
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as assetsSingleWriter } from "../../../../tooling/src/verify/gates/assets-single-writer.ts";
import { gate as contractVerbPresence } from "../../../../tooling/src/verify/gates/contract-verb-presence.ts";
import { gate as dbStructure } from "../../../../tooling/src/verify/gates/db-structure.ts";
import { gate as dbStructureProducerHome } from "../../../../tooling/src/verify/gates/db-structure-producer-home.ts";
import { gate as jsonParity } from "../../../../tooling/src/verify/gates/json-column-write-parity.ts";
import { gate as jsonHealth } from "../../../../tooling/src/verify/gates/json-column-write-parity-health.ts";
import { gate as openParity } from "../../../../tooling/src/verify/gates/open-json-column-key-parity.ts";
import { gate as openDeferred } from "../../../../tooling/src/verify/gates/open-json-column-key-parity-deferred.ts";
import { gate as openHealth } from "../../../../tooling/src/verify/gates/open-json-column-key-parity-health.ts";
import { gate as wireVocabulary } from "../../../../tooling/src/verify/gates/wire-schema-vocab-one-home.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { DifferentialClaim, Files, Seen, TmpdirReplay } from "../../../support/legacy-differential.ts";
import {
  createDifferential,
  createTmpdirDifferential,
  differentialViolations,
  frozenFilesystemLegacyGate,
  frozenLegacyGate,
  inMemorySide,
  legacyScenarios,
  unlined,
} from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BASE = "4522eee58";
const BUDGET_MS = scaledBudget(60_000);

test("wire vocabulary evidence missing its engine fails closed", () => {
  expect(wireVocabulary.mustRefuse.some((proof) => proof.expect.messageIncludes.includes("has no BOUND_KEYWORDS initializer"))).toBe(true);
  expect(verifyPolicyProofs([wireVocabulary])).toEqual([]);
});

function toolErrorCode(owner: string, phase: string, message: string): string {
  if (message.includes("expression admitted zero paths")) {
    return `${owner}/${phase}/missing-engine`;
  }
  if (message.includes("has no BOUND_KEYWORDS initializer")) {
    return `${owner}/${phase}/missing-vocabulary`;
  }
  throw new Error(`unclassified schema/data differential tool error: ${owner}/${phase}: ${message}`);
}

const memory = createDifferential("/schema-data-conversion", toolErrorCode);
const tmpdir = createTmpdirDifferential(toolErrorCode);
// JSON is deliberate: the preservation assertions below compare every identity field independently. A
// rendered label can prove counts while silently accepting a moved file, token, coordinate, or message.
const fullLabel = (seen: Seen): string => JSON.stringify(seen);
const same = (successor: string): readonly DifferentialClaim[] => [{ classification: "identical", successor }];
const vacuous = (): readonly DifferentialClaim[] => [{ classification: "vacuous-both-zero", successor: null }];
const granted = (): readonly DifferentialClaim[] => [{ classification: "exemption-mechanism-move", successor: null }];
const sameAndGranted = (successor: string): readonly DifferentialClaim[] => [
  { classification: "identical", successor },
  { classification: "exemption-mechanism-move", successor },
];
const retired = (retiredWhy: string): readonly DifferentialClaim[] => [{ classification: "retired-arm", successor: null, retiredWhy }];
const retiredAndGranted = (retiredWhy: string): readonly DifferentialClaim[] => [
  ...retired(retiredWhy),
  { classification: "exemption-mechanism-move", successor: null, retiredWhy },
];
const refused = (): readonly DifferentialClaim[] => [{ classification: "runtime-refusal", successor: "wire-schema-vocabulary" }];
const moved = (successor: string): readonly DifferentialClaim[] => [{ classification: "anchor-move", successor }];

interface Expected {
  readonly claims: readonly DifferentialClaim[];
  readonly legacyPopulation: number;
  readonly finalPopulation: number;
  readonly final: number;
  readonly raw: number;
  readonly grants: number;
  readonly errors: readonly string[];
  readonly subjects: readonly string[];
}
type ExpectedArgs = readonly [
  claims: readonly DifferentialClaim[],
  legacyPopulation: number,
  finalPopulation: number,
  final: number,
  raw?: number,
  grants?: number,
  errors?: readonly string[],
  subjects?: readonly string[],
];
const e = (...args: ExpectedArgs): Expected => {
  const [claims, legacyPopulation, finalPopulation, final, raw = final, grants = 0, errors = [], subjects = []] = args;
  return { claims, legacyPopulation, finalPopulation, final, raw, grants, errors, subjects };
};

const JSON_STALE = "gate-local ALLOWLIST/GUARD_EXEMPT liveness moved to central reviewed-grant liveness";
const ASSET_STALE = "the SANCTIONED zone became six exact central assets-single-writer grants";
const CONTRACT_STALE = "the stale DEFERRED row became central reviewed-grant liveness";

interface Subject {
  readonly path: string;
  readonly fallback: string;
  readonly policies: readonly GatePolicy[];
  readonly rows: readonly Expected[];
}

const SUBJECTS: readonly Subject[] = [
  {
    path: "tooling/src/verify/gates/json-column-write-parity.ts",
    fallback: "packages/server/src/domain/settings/persistence/queries.ts",
    policies: [jsonParity, jsonHealth],
    rows: [
      e(same(jsonParity.id), 3, 3, 1),
      e(same(jsonParity.id), 4, 4, 1),
      ...Array.from({ length: 7 }, () => e(same(jsonParity.id), 3, 3, 1)),
      e(moved(jsonHealth.id), 3, 3, 1),
      e(retired(JSON_STALE), 2, 2, 0),
      e(vacuous(), 2, 2, 0),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 3, 3, 0),
      ...Array.from({ length: 4 }, () => e(vacuous(), 2, 2, 0)),
      ...Array.from({ length: 4 }, () => e(vacuous(), 3, 3, 0)),
      e(vacuous(), 2, 2, 0),
    ],
  },
  {
    path: "tooling/src/verify/gates/open-json-column-key-parity.ts",
    fallback: "packages/server/src/domain/assets/persistence/queries.ts",
    policies: [openParity, openDeferred, openHealth],
    rows: [
      ...Array.from({ length: 4 }, () => e(same(openParity.id), 3, 3, 1)),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 2, 2, 0),
      e(vacuous(), 2, 2, 0),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 3, 3, 0),
    ],
  },
  {
    path: "tooling/src/verify/gates/wire-schema-vocab-one-home.ts",
    fallback: "packages/server/src/infra/providers/backends/newvendor/schema.ts",
    policies: [wireVocabulary],
    rows: [
      e(refused(), 1, 1, 0, 0, 0, [
        `${wireVocabulary.id}/authority/missing-engine`,
        `${wireVocabulary.id}/evaluate/missing-engine`,
        "wire-schema-vocabulary/population/missing-engine",
      ]),
      e(sameAndGranted(wireVocabulary.id), 3, 3, 1, 2, 1),
      e(sameAndGranted(wireVocabulary.id), 3, 3, 1, 2, 1),
      e(refused(), 2, 2, 0, 0, 0, [
        `${wireVocabulary.id}/authority/missing-vocabulary`,
        `${wireVocabulary.id}/evaluate/missing-vocabulary`,
        "wire-schema-vocabulary/finish/missing-vocabulary",
      ]),
      e(granted(), 2, 2, 0, 1, 1),
      e(granted(), 4, 4, 0, 1, 1),
      e(granted(), 3, 3, 0, 1, 1),
    ],
  },
  {
    path: "tooling/src/verify/gates/assets-single-writer.ts",
    fallback: "packages/server/src/domain/not-assets/verbs/x.ts",
    policies: [assetsSingleWriter],
    rows: [
      e(same(assetsSingleWriter.id), 1, 3, 1),
      e(moved(assetsSingleWriter.id), 1, 3, 1),
      e(retired(ASSET_STALE), 1, 2, 0),
      e(granted(), 1, 2, 0, 1, 1),
      e(vacuous(), 1, 3, 0),
      e(granted(), 1, 2, 0, 1, 1),
    ],
  },
  {
    path: "tooling/src/verify/gates/contract-verb-presence.ts",
    fallback: "packages/server/src/domain/widget/contract.ts",
    policies: [contractVerbPresence],
    rows: [
      e(moved(contractVerbPresence.id), 2, 2, 1),
      e(moved(contractVerbPresence.id), 3, 3, 1),
      ...Array.from({ length: 5 }, () => e(moved(contractVerbPresence.id), 2, 2, 1)),
      e(retiredAndGranted(CONTRACT_STALE), 4, 3, 0, 1, 1),
      e(vacuous(), 2, 2, 0),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 2, 2, 0),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 3, 3, 0),
      e(vacuous(), 2, 2, 0),
      e(vacuous(), 2, 2, 0),
      e(granted(), 1, 1, 0, 1, 1),
      e(granted(), 3, 2, 0, 2, 2),
      e(vacuous(), 1, 1, 0),
    ],
  },
];

const DB_SUBJECTS = [
  [
    "packages/db/src/schema/index.ts",
    "packages/db/src/schema/orphan.ts",
    "packages/server/src/domain",
    "packages/server/src/domain/orphan",
    "packages/server/src/domain/orphan/index.ts",
  ],
  ["packages/db/src/schema/thing.ts", "packages/server/src/domain", "packages/server/src/domain/thing", "packages/server/src/domain/thing/index.ts"],
  [
    "packages/db/src/schema/index.ts",
    "packages/db/src/schema/nowhere.ts",
    "packages/server/src/domain",
    "packages/server/src/domain/other",
    "packages/server/src/domain/other/index.ts",
  ],
  [
    "packages/db/src/schema/index.ts",
    "packages/db/src/schema/thing.ts",
    "packages/server/src/domain",
    "packages/server/src/domain/thing",
    "packages/server/src/domain/thing/index.ts",
  ],
] as const;
const DB_ROWS = [
  e(moved(dbStructure.id), 2, 2, 1, 1, 0, [], DB_SUBJECTS[0]),
  e(moved(dbStructure.id), 1, 1, 1, 1, 0, [], DB_SUBJECTS[1]),
  e(moved(dbStructureProducerHome.id), 3, 2, 1, 1, 0, [], DB_SUBJECTS[2]),
  e(vacuous(), 2, 2, 0, 0, 0, [], DB_SUBJECTS[3]),
] as const;

interface IdentitySet {
  readonly final: readonly Seen[];
  readonly raw: readonly Seen[];
}

interface IdentityPlan {
  readonly transition: string;
  readonly expected: (legacy: readonly Seen[]) => IdentitySet;
}

function parseIdentities(labels: readonly string[]): readonly Seen[] {
  return labels.map((value) => JSON.parse(value) as Seen);
}

function reviewedFinding(
  policy: GatePolicy,
  identity: { readonly file: string; readonly line: number; readonly token?: string; readonly subject: string; readonly operation: string },
): Seen {
  const { file, line, token, subject, operation } = identity;
  return {
    file,
    line,
    token,
    message: `${policy.message} Subject: ${subject}, operation: ${operation}, line(s): ${String(line)}.`,
    policyId: policy.id,
  };
}

function preservedGrant(
  policy: GatePolicy,
  subject: string,
  operation: string,
  options: { readonly token?: string; readonly lineDelta?: number } = {},
): IdentityPlan {
  return {
    transition:
      options.token === undefined
        ? "central-authority message suffix; file, line, and token preserved"
        : "central-authority message suffix with declared token-anchor move",
    expected: (legacy): IdentitySet => {
      expect(legacy, "a preserved finding plan maps exactly one legacy finding").toHaveLength(1);
      const [before] = legacy;
      if (before === undefined) {
        throw new Error("preserved finding plan received no legacy finding");
      }
      const line = before.line + (options.lineDelta ?? 0);
      const finding: Seen = {
        file: before.file,
        line,
        token: options.token ?? before.token,
        message: `${before.message} Subject: ${subject}, operation: ${operation}, line(s): ${String(line)}.`,
        policyId: policy.id,
      };
      return { final: [finding], raw: [finding] };
    },
  };
}

function exactPlan(transition: string, final: readonly Seen[], raw: readonly Seen[] = final): IdentityPlan {
  return { transition, expected: () => ({ final, raw }) };
}

const CONTRACT_MESSAGE_TAIL =
  " — the *Service interface declares this verb but no test in its domain tree invokes it as a service method or through its `create<Verb>(` factory (core/Spine-Testing.md §5; test-support-dry-punchlist.md W1i). Add a behavioral test at tests/server/domain/ or, for a tracked gap, a reviewed grant.";

function contractFinding(file: string, line: number, verb: string, declaredIn: string): Seen {
  return {
    file,
    line,
    token: verb.split(".").at(-1) ?? verb,
    message: `${verb.includes(".") ? verb : `hub.${verb}`} (declared on ${declaredIn})${CONTRACT_MESSAGE_TAIL}`,
    policyId: contractVerbPresence.id,
  };
}

const liftFinding = reviewedFinding(wireVocabulary, {
  file: "packages/kit/src/json-schema/lift.ts",
  line: 1,
  token: '"minLength"',
  subject: "packages/kit/src/json-schema/lift.ts",
  operation: "wire-schema-vocabulary-home",
});

// Every row that produces a final finding (effective or grant-consumed raw) has one explicit identity
// transition. Rows absent here are either both-zero, a declared runtime refusal, or a retired legacy arm
// whose empty successor is checked by its DifferentialClaim.
const IDENTITIES: Readonly<Record<string, IdentityPlan>> = {
  "tooling/src/verify/gates/json-column-write-parity.ts#0": preservedGrant(jsonParity, "refinerySessions.selection", "json-column-straddle"),
  "tooling/src/verify/gates/json-column-write-parity.ts#1": preservedGrant(jsonParity, "refinerySessions.selection", "json-column-straddle"),
  "tooling/src/verify/gates/json-column-write-parity.ts#2": preservedGrant(jsonParity, "refinerySessions.selection", "json-column-straddle", { token: "set" }),
  "tooling/src/verify/gates/json-column-write-parity.ts#3": preservedGrant(jsonParity, "chats.metadata", "json-column-straddle"),
  "tooling/src/verify/gates/json-column-write-parity.ts#4": preservedGrant(jsonParity, "rpgSheets.sheet", "json-column-straddle"),
  "tooling/src/verify/gates/json-column-write-parity.ts#5": preservedGrant(
    jsonParity,
    "packages/server/src/domain/settings/persistence/queries.ts#writeUserConfig",
    "versioned-config-replace",
  ),
  "tooling/src/verify/gates/json-column-write-parity.ts#6": preservedGrant(
    jsonParity,
    "packages/server/src/domain/settings/persistence/queries.ts#writeUserConfig",
    "versioned-config-replace",
  ),
  "tooling/src/verify/gates/json-column-write-parity.ts#7": preservedGrant(
    jsonParity,
    "packages/server/src/domain/preset/persistence/writes.ts#writePresetRow",
    "versioned-config-replace",
  ),
  "tooling/src/verify/gates/json-column-write-parity.ts#8": preservedGrant(
    jsonParity,
    "packages/server/src/domain/settings/persistence/queries.ts#seed",
    "versioned-config-replace",
  ),
  "tooling/src/verify/gates/json-column-write-parity.ts#9": exactPlan("health split moves the unreadable declaration to its source call", [
    {
      file: "packages/contracts/src/preset/index.ts",
      line: 1,
      token: "defineVersionedConfig",
      message:
        "UNREADABLE `defineVersionedConfig(...)` declaration — the gate cannot resolve which TYPE this versioned config owns (no explicit type argument, and the binding's declared type is not a `VersionedConfig<T>`). Its columns therefore carry NO write guard obligation, silently. Write the type argument explicitly (`defineVersionedConfig<PromptConfig>({ … })`) so the ownership is readable without the checker. Unreadable declaration: promptConfigConfig.",
      policyId: jsonHealth.id,
    },
  ]),
  "tooling/src/verify/gates/open-json-column-key-parity.ts#0": preservedGrant(openParity, "imageEmbeddings.captionMeta:artStyle", "open-json-key-read", {
    token: "sql",
  }),
  "tooling/src/verify/gates/open-json-column-key-parity.ts#1": preservedGrant(openParity, "imageEmbeddings.captionMeta:palette", "open-json-key-read", {
    token: "row",
  }),
  "tooling/src/verify/gates/open-json-column-key-parity.ts#2": preservedGrant(openParity, "imageEmbeddings.captionMeta", "open-json-key-read", {
    token: "row",
  }),
  "tooling/src/verify/gates/open-json-column-key-parity.ts#3": preservedGrant(openParity, "widgets.residue", "open-json-key-read", { token: "sql" }),
  "tooling/src/verify/gates/wire-schema-vocab-one-home.ts#1": exactPlan(
    "engine vocabulary replaces the legacy local table message; file and line stay fixed and the keyword token becomes explicit",
    [
      reviewedFinding(wireVocabulary, {
        file: "packages/server/src/infra/providers/backends/newvendor/schema.ts",
        line: 1,
        token: '"minLength"',
        subject: "packages/server/src/infra/providers/backends/newvendor/schema.ts",
        operation: "wire-schema-vocabulary-home",
      }),
    ],
    [
      liftFinding,
      reviewedFinding(wireVocabulary, {
        file: "packages/server/src/infra/providers/backends/newvendor/schema.ts",
        line: 1,
        token: '"minLength"',
        subject: "packages/server/src/infra/providers/backends/newvendor/schema.ts",
        operation: "wire-schema-vocabulary-home",
      }),
    ],
  ),
  "tooling/src/verify/gates/wire-schema-vocab-one-home.ts#2": exactPlan(
    "engine vocabulary replaces the legacy local table message; file and line stay fixed and the keyword token becomes explicit",
    [
      reviewedFinding(wireVocabulary, {
        file: "packages/kit/src/wire/subset2.ts",
        line: 2,
        token: '"minimum"',
        subject: "packages/kit/src/wire/subset2.ts",
        operation: "wire-schema-vocabulary-home",
      }),
    ],
    [
      liftFinding,
      reviewedFinding(wireVocabulary, {
        file: "packages/kit/src/wire/subset2.ts",
        line: 2,
        token: '"minimum"',
        subject: "packages/kit/src/wire/subset2.ts",
        operation: "wire-schema-vocabulary-home",
      }),
    ],
  ),
  ...Object.fromEntries(
    [4, 5, 6].map((index) => [
      `tooling/src/verify/gates/wire-schema-vocab-one-home.ts#${String(index)}`,
      exactPlan("central grant consumes the canonical lift-reader finding", [], [liftFinding]),
    ]),
  ),
  "tooling/src/verify/gates/assets-single-writer.ts#0": exactPlan(
    "shared writer fact keeps file, line, and callable token while replacing the legacy policy message",
    [
      reviewedFinding(assetsSingleWriter, {
        file: "packages/server/src/domain/hub/x.ts",
        line: 1,
        token: "storeBlob",
        subject: "packages/server/src/domain/hub/x.ts",
        operation: "asset-write-site",
      }),
    ],
  ),
  "tooling/src/verify/gates/assets-single-writer.ts#1": exactPlan(
    "canonical import completion shifts the raw-insert anchor by one line and the token narrows to the resolved call",
    [
      reviewedFinding(assetsSingleWriter, {
        file: "packages/server/src/domain/hub/y.ts",
        line: 3,
        token: "insert",
        subject: "packages/server/src/domain/hub/y.ts",
        operation: "asset-write-site",
      }),
    ],
  ),
  ...Object.fromEntries(
    [3, 5].map((index) => [
      `tooling/src/verify/gates/assets-single-writer.ts#${String(index)}`,
      exactPlan(
        "central grant consumes the canonical assets persistence writer",
        [],
        [
          reviewedFinding(assetsSingleWriter, {
            file: "packages/server/src/domain/assets/persistence/queries.ts",
            line: 4,
            token: "insert",
            subject: "packages/server/src/domain/assets/persistence/queries.ts",
            operation: "asset-write-site",
          }),
        ],
      ),
    ]),
  ),
  "tooling/src/verify/gates/contract-verb-presence.ts#0": exactPlan(
    "resolved declaration anchor replaces the legacy gate-file anchor and the stale DEFERRED wording becomes central-grant wording",
    [contractFinding("packages/server/src/domain/hub/contract/service.ts", 2, "uncoveredVerb", "HubService")],
  ),
  "tooling/src/verify/gates/contract-verb-presence.ts#1": exactPlan("inherited verb moves to its imported declaring interface", [
    contractFinding("packages/server/src/domain/hub/contract/verbs.ts", 2, "hub.inherited", "HubVerbService"),
  ]),
  ...Object.fromEntries(
    [
      [2, "build"],
      [3, "parkedVerb"],
      [4, "save"],
      [5, "save"],
      [6, "save"],
    ].map(([index, verb]) => [
      `tooling/src/verify/gates/contract-verb-presence.ts#${String(index)}`,
      exactPlan("resolved member declaration supplies the exact verb token and central-grant wording", [
        contractFinding("packages/server/src/domain/hub/contract/service.ts", 2, String(verb), "HubService"),
      ]),
    ]),
  ),
  "tooling/src/verify/gates/contract-verb-presence.ts#7": exactPlan(
    "retired local DEFERRED row is a production-dispatched central grant",
    [],
    [contractFinding("packages/server/src/domain/discovery/contract/service.ts", 2, "discovery.themes", "DiscoveryService")],
  ),
  "tooling/src/verify/gates/contract-verb-presence.ts#16": exactPlan(
    "central grant consumes the discovery contract debt",
    [],
    [contractFinding("packages/server/src/domain/discovery/contract/service.ts", 2, "discovery.themes", "DiscoveryService")],
  ),
  "tooling/src/verify/gates/contract-verb-presence.ts#17": exactPlan(
    "central grants consume both live contract debts",
    [],
    [
      contractFinding("packages/server/src/domain/chat/contract/service.ts", 2, "chat.getRoomOverridesForChat", "ChatService"),
      contractFinding("packages/server/src/domain/discovery/contract/service.ts", 2, "discovery.themes", "DiscoveryService"),
    ],
  ),
  "tooling/src/verify/gates/db-structure.ts#0": exactPlan(
    "schema-module finding keeps its file and moves from the synthetic line zero to the first authored token",
    [{ file: "packages/db/src/schema/orphan.ts", line: 1, token: "export", message: dbStructure.message, policyId: dbStructure.id }],
  ),
  "tooling/src/verify/gates/db-structure.ts#1": exactPlan("missing-barrel finding moves from the absent barrel path to the first affected schema module", [
    {
      file: "packages/db/src/schema/thing.ts",
      line: 1,
      token: "export",
      message: "the schema barrel index.ts is missing — every schema file must be re-exported from it.",
      policyId: dbStructure.id,
    },
  ]),
  "tooling/src/verify/gates/db-structure.ts#2": exactPlan(
    "producer-home split keeps the schema file and moves from synthetic line zero to the resource entry",
    [
      {
        file: "packages/db/src/schema/nowhere.ts",
        line: 1,
        token: undefined,
        message:
          "a schema module has no same-named producer domain; non-domain producer ownership requires an exact reviewed grant. Subject: packages/db/src/schema/nowhere.ts, operation: non-domain-schema-producer, site(s): packages/db/src/schema/nowhere.ts:1 (nowhere).",
        policyId: dbStructureProducerHome.id,
      },
    ],
  ),
};

function withDrizzleImports(files: Files): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([file, source]) => [
      file,
      file.startsWith("packages/db/src/schema/") && /\b(?:sqliteTable|text)\s*\(/u.test(source) && !source.includes("drizzle-orm/sqlite-core")
        ? `import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n${source}`
        : source,
    ]),
  );
}

function completeAssets(out: Record<string, string>): void {
  out["packages/db/src/schema/assets.ts"] ??=
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const assets = sqliteTable("assets", { id: text("id") });\n';
  out["packages/server/src/domain/assets/persistence/queries.ts"] ??= "export async function storeBlob(): Promise<void> {}\n";
  for (const [file, source] of Object.entries(out)) {
    let adapted = source;
    if (adapted.includes('from "@orb/db"')) {
      const relative = file.includes("/persistence/") ? "../../../../../db/src/schema/assets.ts" : "../../../../db/src/schema/assets.ts";
      adapted = adapted.replace('from "@orb/db"', `from "${relative}"`);
    }
    if (adapted.includes("db: { insert:")) {
      adapted = `import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";\n${adapted}`
        .replace("db: { insert: (t: unknown) => void }", 'db: BaseSQLiteDatabase<"async", unknown>')
        .replace("db: { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } }", 'db: BaseSQLiteDatabase<"async", unknown>');
    }
    out[file] = adapted;
  }
}

function addDbProducers(out: Record<string, string>): void {
  for (const file of Object.keys(out)) {
    const match = /^packages\/db\/src\/schema\/([^/]+)\.ts$/u.exec(file);
    if (match !== null && match[1] !== "index") {
      out[`packages/server/src/domain/${match[1]}/index.ts`] = "export const producer = true;\n";
    }
  }
}

function completed(path: string, files: Files, index: number): Files {
  const out = withDrizzleImports(files);
  if (path.endsWith("assets-single-writer.ts")) {
    completeAssets(out);
  }
  if (path.endsWith("db-structure.ts") && index !== 2) {
    addDbProducers(out);
  }
  return out;
}

function assertLegacyExpectation(legacy: GateDescriptor, index: number, findings: readonly string[], tag: string): void {
  const proof = index < legacy.mustFlag.length ? legacy.mustFlag[index] : undefined;
  const token = proof?.expect?.token;
  const message = proof?.expect?.messageIncludes;
  const identities = parseIdentities(findings);
  expect(
    {
      count: findings.length,
      token: token === undefined || identities.some((finding) => finding.token === token),
      message: message === undefined || identities.some((finding) => finding.message.includes(message)),
    },
    `${tag}: frozen authored expectation`,
  ).toEqual({ count: proof === undefined ? 0 : (proof.expect?.count ?? 1), token: true, message: true });
}

function assertIdentity(before: ReturnType<typeof memory.legacyReplay> | TmpdirReplay, after: TmpdirReplay, tag: string): void {
  const plan = IDENTITIES[tag];
  if ((after.findings.length > 0 || after.raw.length > 0) && plan === undefined) {
    throw new Error(`${tag}: final output has no explicit finding-identity transition`);
  }
  if (plan === undefined) {
    return;
  }
  const expected = plan.expected(parseIdentities(before.findings));
  expect(parseIdentities(after.findings), `${tag}: ${plan.transition} (effective)`).toEqual(expected.final);
  expect(parseIdentities(after.raw), `${tag}: ${plan.transition} (raw)`).toEqual(expected.raw);
}

function assertFinal(expected: Expected, before: ReturnType<typeof memory.legacyReplay>, after: TmpdirReplay, tag: string): void {
  expect(after.findings, `${tag}: final findings`).toHaveLength(expected.final);
  expect(after.raw, `${tag}: final raw findings`).toHaveLength(expected.raw);
  expect(after.granted, `${tag}: consumed grants`).toHaveLength(expected.grants);
  expect(after.population, `${tag}: final source population`).toBe(expected.finalPopulation);
  expect(after.subjects, `${tag}: final resource subjects`).toEqual(expected.subjects);
  expect(after.toolErrors, `${tag}: final tool errors`).toEqual(expected.errors.toSorted());
  expect(after.thrown, `${tag}: final replay returns a receipt`).toBeUndefined();
  assertIdentity(before, after, tag);
  for (const claim of expected.claims) {
    expect(differentialViolations(claim, inMemorySide(before), after), `${tag}: ${claim.classification}`).toEqual([]);
  }
}

test(
  "all 65 in-memory legacy rows survive or name a classified successor",
  async ({ scratch }) => {
    let comparisons = 0;
    for (const subject of SUBJECTS) {
      const legacy = await frozenLegacyGate(scratch, BASE, subject.path);
      const examples = legacyScenarios(legacy, subject.fallback);
      expect(subject.rows, `${subject.path}: one declaration per frozen row`).toHaveLength(examples.length);
      for (const [index, files] of examples.entries()) {
        const expected = subject.rows[index] as Expected;
        const tag = `${subject.path}#${index}`;
        const twin = completed(subject.path, files, index);
        const before = memory.legacyReplay(legacy, files, fullLabel);
        assertLegacyExpectation(legacy, index, before.findings, tag);
        expect(before.population, `${tag}: legacy source population`).toBe(expected.legacyPopulation);
        expect(before.toolErrors).toEqual([]);
        expect(memory.legacyReplay(legacy, twin, unlined).findings, `${tag}: completion is legacy-inert`).toEqual(
          memory.legacyReplay(legacy, files, unlined).findings,
        );
        assertFinal(expected, before, tmpdir.finalReplay(subject.policies, twin, fullLabel, reviewedGrantsFor(subject.policies)), tag);
        comparisons += 1;
      }
    }
    expect(comparisons).toBe(65);
  },
  BUDGET_MS,
);

test(
  "all four filesystem legacy rows preserve findings, subjects, and classified anchor moves",
  async ({ scratch }) => {
    const path = "tooling/src/verify/gates/db-structure.ts";
    const policies = [dbStructure, dbStructureProducerHome];
    const legacy = await frozenFilesystemLegacyGate(scratch, BASE, path);
    const examples = legacyScenarios(legacy, "packages/db/src/schema/index.ts");
    expect(DB_ROWS).toHaveLength(examples.length);
    for (const [index, files] of examples.entries()) {
      const expected = DB_ROWS[index] as Expected;
      const tag = `${path}#${index}`;
      const twin = completed(path, files, index);
      const before = tmpdir.legacyReplay(legacy, files, fullLabel);
      assertLegacyExpectation(legacy, index, before.findings, tag);
      expect(before.population).toBe(expected.legacyPopulation);
      expect(before.subjects).toEqual([]);
      expect(before.toolErrors).toEqual([]);
      expect(tmpdir.legacyReplay(legacy, twin, unlined).findings, `${tag}: completion is legacy-inert`).toEqual(
        tmpdir.legacyReplay(legacy, files, unlined).findings,
      );
      const after = tmpdir.finalReplay(policies, twin, fullLabel, reviewedGrantsFor(policies));
      expect(after.findings).toHaveLength(expected.final);
      expect(after.raw).toHaveLength(expected.raw);
      expect(after.granted).toHaveLength(expected.grants);
      expect(after.population).toBe(expected.finalPopulation);
      expect(after.subjects).toEqual(expected.subjects);
      expect(after.toolErrors).toEqual(expected.errors);
      expect(after.thrown).toBeUndefined();
      assertIdentity(before, after, tag);
      for (const claim of expected.claims) {
        expect(differentialViolations(claim, before, after), `${tag}: ${claim.classification}`).toEqual([]);
      }
    }
  },
  BUDGET_MS,
);
