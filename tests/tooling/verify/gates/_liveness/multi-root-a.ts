// Real-corpus liveness arms (#2149) for policies whose declared population spans several roots — the bus
// family, the CSS census families, the db/server write-parity families and their neighbours (0042's tenth
// chunk, first half). DATA, collected by the one runner (`./runner.ts`),
// which loads each isolated structure corpus once and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE. A defect that is a MEMBER of a
// real declaration (a field on a real interface, a code on a real tuple) is planted with `edit`, one exact
// change of that file; a tripwire loses its real subject by `neutralise`/`remove`; a CSS defect is appended to
// the real sheet through the ResourceHost's own overlay; a reviewed-grant policy whose every report is
// licensed is pinned by grant consumption. The bus arms that declare a new union share the batched pass, so the
// bus fact sees every one of them; the runner's entanglement check proves those arms alone. An arm that would
// leave the bus fact incomplete edits a real union instead, so it runs alone and withholds no batch-mate.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as agentBridgeLock } from "../../../../../tooling/src/verify/gates/agent-bridge-lock.ts";
import { gate as appearanceCarrierContract } from "../../../../../tooling/src/verify/gates/appearance-carrier-contract.ts";
import { gate as appearanceCarrierHealth } from "../../../../../tooling/src/verify/gates/appearance-carrier-health.ts";
import { gate as assetsSingleWriter } from "../../../../../tooling/src/verify/gates/assets-single-writer.ts";
import { gate as boundedListLimit } from "../../../../../tooling/src/verify/gates/bounded-list-limit.ts";

import { gate as busConsumerBelt } from "../../../../../tooling/src/verify/gates/bus-consumer-belt.ts";
import { gate as busPayloadAllowlistHealth } from "../../../../../tooling/src/verify/gates/bus-payload-allowlist-health.ts";
import { gate as busProducerCoverage } from "../../../../../tooling/src/verify/gates/bus-producer-coverage.ts";
import { gate as caughtFailureCensusRow } from "../../../../../tooling/src/verify/gates/caught-failure-census-row.ts";
import { gate as caughtFailureOwnership } from "../../../../../tooling/src/verify/gates/caught-failure-ownership.ts";
import { gate as caughtFailureOwnershipHealth } from "../../../../../tooling/src/verify/gates/caught-failure-ownership-health.ts";
import { gate as contractBannedShapes } from "../../../../../tooling/src/verify/gates/contract-banned-shapes.ts";
import { gate as contractVerbPresence } from "../../../../../tooling/src/verify/gates/contract-verb-presence.ts";
import { gate as cssLengthTokens } from "../../../../../tooling/src/verify/gates/css-length-tokens.ts";
import { gate as cssLengthTokensGrants } from "../../../../../tooling/src/verify/gates/css-length-tokens-grants.ts";
import { gate as cssLengthTokensHealth } from "../../../../../tooling/src/verify/gates/css-length-tokens-health.ts";
import { gate as cssVarDefined } from "../../../../../tooling/src/verify/gates/css-var-defined.ts";
import { gate as cssVarDefinedGrants } from "../../../../../tooling/src/verify/gates/css-var-defined-grants.ts";
import { gate as designAuditRuleProof } from "../../../../../tooling/src/verify/gates/design-audit-rule-proof.ts";
import { gate as domainFreshnessPlane } from "../../../../../tooling/src/verify/gates/domain-freshness-plane.ts";
import { gate as jsonColumnWriteParity } from "../../../../../tooling/src/verify/gates/json-column-write-parity.ts";
import { gate as knobWireCoverage } from "../../../../../tooling/src/verify/gates/knob-wire-coverage.ts";
import { gate as messageKindPolicyCoverage } from "../../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";

const MANIFEST = "packages/client/src/lib/appearance-carrier-manifest.ts";
const CONTRACTS = "packages/contracts/src";
const DOMAIN = "packages/server/src/domain/character";
const SHELL_SHEET = "packages/client/src/features/app-shell/surfaces/shell.css";
const USER_BUS = `${CONTRACTS}/user-bus/index.ts`;
const CENSUS = "tooling/src/verify/gates/caught-failure-ownership.population.json";
const LIFT = "packages/kit/src/json-schema/lift.ts";
const USER_BUS_HEAD = "export type UserBusEvent =\n";

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

function neutralise(path: string, source = "export {};\n"): RealCorpusOverlay {
  return { kind: "neutralise", path, source };
}

function edit(path: string, search: string, replacement: string): RealCorpusOverlay {
  return { kind: "edit", path, replace: [search, replacement] };
}

export const MULTI_ROOT_A_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: agentBridgeLock,
    overlays: [add("packages/client/src/lib/liveness-rogue.ts", 'window["__orb"] = globalThis.__orb;\n')],
    messageIncludes: "outside the sanctioned bridge door",
  },
  {
    policy: appearanceCarrierContract,
    // The manifest keeps one key and declares no carrier for it.
    overlays: [
      neutralise(
        MANIFEST,
        'export const APPEARANCE_OWNER_KEYS = { sizing: ["width"] };\nexport const APPEARANCE_CARRIER_MANIFEST = { width: { owner: "sizing", carriers: [] } };\n',
      ),
    ],
    messageIncludes: "has no executable carrier declaration",
  },
  {
    policy: appearanceCarrierHealth,
    overlays: [neutralise(MANIFEST, "export const APPEARANCE_OWNER_KEYS = { sizing: [] };\nexport const APPEARANCE_CARRIER_MANIFEST = {};\n")],
    messageIncludes: "schema↔manifest",
  },
  {
    policy: assetsSingleWriter,
    overlays: [add(`${DOMAIN}/liveness-assets.ts`, 'import { storeBlob } from "../assets/persistence/queries.ts";\nexport const livenessStore = storeBlob;\n')],
    messageIncludes: "storeBlob",
  },
  {
    policy: boundedListLimit,
    overlays: [
      add(
        "packages/server/src/transport/trpc/routers/liveness-list.ts",
        'import { z } from "zod";\nexport const livenessListInput = z.object({ limit: z.number().int().optional() });\n',
      ),
    ],
    messageIncludes: "unbounded `limit`",
  },

  {
    policy: busConsumerBelt,
    overlays: [
      add(
        `${CONTRACTS}/liveness-consumer/index.ts`,
        'export type LivenessConsumerBusEvent = { type: "livenessConsumed" };\nexport const LIVENESS_CONSUMER_EVENT_TYPES = { livenessConsumed: true } satisfies Record<LivenessConsumerBusEvent["type"], true>;\n',
      ),
    ],
    messageIncludes: "has NO consumer coverage",
  },
  {
    policy: busPayloadAllowlistHealth,
    // The payload family reads exact declaration names in exact homes, so the open key space goes on the real
    // UserBusEvent.
    overlays: [edit(USER_BUS, USER_BUS_HEAD, `${USER_BUS_HEAD}  | { type: "livenessMeta"; meta: Record<string, string> }\n`)],
    messageIncludes: "Shape: unsupported-shape:Record.",
  },
  {
    policy: busProducerCoverage,
    overlays: [
      add(
        `${CONTRACTS}/liveness-producer/bus.ts`,
        'export type LivenessProducerBusEvent = { type: "livenessNeverEmitted" };\nexport const LIVENESS_PRODUCER_BUS_EVENT_TYPES = { livenessNeverEmitted: true } satisfies Record<LivenessProducerBusEvent["type"], true>;\n',
      ),
    ],
    messageIncludes: "livenessNeverEmitted",
  },
  {
    policy: caughtFailureCensusRow,
    // A new caught-failure site the committed census has no row for.
    overlays: [add(`${DOMAIN}/liveness-absorb.ts`, "export function livenessAbsorb(): void {\n  try {\n    risky();\n  } catch {}\n}\n")],
    messageIncludes: "has no census row",
  },
  {
    policy: caughtFailureOwnershipHealth,
    // The recorded `compilePattern` catch now rethrows, so its committed row names a site that is no longer there.
    overlays: [edit(LIFT, "  } catch {\n    return null;\n  }", "  } catch (error) {\n    throw error;\n  }")],
    reportsAt: [CENSUS],
    messageIncludes: "names a site that is no longer on the tree",
  },
  {
    policy: caughtFailureOwnership,
    overlays: [
      add("packages/client/src/features/chat/lib/liveness-raw.ts", "export function livenessRaw(): void {\n  void save().catch(() => undefined);\n}\n"),
    ],
    messageIncludes: "UNPROVEN OWNERSHIP",
  },
  {
    policy: contractBannedShapes,
    // The ledger killed `Principal.kind` by name (D60).
    overlays: [add(`${CONTRACTS}/liveness-principal.ts`, "export interface Principal {\n  userId: string;\n  kind: string;\n}\n")],
    messageIncludes: "D60",
  },
  {
    policy: contractVerbPresence,
    // The fact reads only `domain/<d>/contract/service.ts`, so the uncovered verb joins the real CharacterService.
    overlays: [
      edit(
        `${DOMAIN}/contract/service.ts`,
        "export interface CharacterService {\n",
        "export interface CharacterService {\n  readonly livenessUncovered: () => void;\n",
      ),
    ],
    messageIncludes: "character.livenessUncovered",
  },
  {
    policy: cssLengthTokensGrants,
    // Stylesheet lengths are read from the shell sheet alone; a length query there is structural by definition.
    overlays: [{ kind: "resource", path: SHELL_SHEET, append: "\n@media (max-width: 7rem) {\n}\n" }],
    messageIncludes: "Subject: @media (max-width: 7rem) {",
  },
  {
    policy: cssLengthTokensHealth,
    overlays: [
      add(
        "packages/client/src/features/chat/components/liveness-dynamic.tsx",
        'let dynamic = "w-[1px]";\ndynamic = "w-[2px]";\nexport const livenessDynamic = <div className={dynamic} />;\n',
      ),
    ],
    messageIncludes: "could not resolve a static class carrier",
  },
  {
    policy: cssLengthTokens,
    overlays: [{ kind: "resource", path: SHELL_SHEET, append: "\n.liveness-paint {\n  gap: 7px;\n}\n" }],
    messageIncludes: "raw non-structural CSS length",
  },
  {
    policy: cssVarDefinedGrants,
    // A runtime writer is keyed on its own file, so a new one is ungranted; a vendor property is keyed on its
    // name, and every real one is already granted.
    overlays: [
      add(
        "packages/client/src/features/chat/components/liveness-runtime-var.tsx",
        'import type { CSSProperties } from "react";\nexport const livenessUse = <div className="h-(--liveness-runtime)" />;\nexport const livenessStyle: CSSProperties = { "--liveness-runtime": 1 };\n',
      ),
    ],
    messageIncludes: "Subject: packages/client/src/features/chat/components/liveness-runtime-var.tsx",
  },
  {
    policy: cssVarDefined,
    overlays: [
      add(
        "packages/client/src/features/chat/components/liveness-missing-var.tsx",
        'export const livenessMissing = <div className="z-(--liveness-missing)" />;\n',
      ),
    ],
    messageIncludes: "no statically proved value source",
  },
  {
    policy: designAuditRuleProof,
    // The registry loses every rule the real proofs bind.
    overlays: [
      neutralise(
        "tooling/src/ui-audit/contract/rules.ts",
        'export const DESIGN_AUDIT_RULES = [{ id: "liveness-rule", family: "decor", severity: ["P3"] }] as const;\n',
      ),
    ],
    messageIncludes: "stale design-audit proof id not present in the registry",
  },
  {
    policy: domainFreshnessPlane,
    overlays: [
      add(
        "packages/server/src/domain/livenessfresh/verbs/write-thing.ts",
        'import { characters } from "@orb/db";\nexport async function run(ctx: C): Promise<void> {\n  await ctx.db.update(characters).set({ name: "x" });\n}\n',
      ),
    ],
    messageIncludes: "MUTATING domain with NO row",
  },
  {
    policy: jsonColumnWriteParity,
    // Every report is a whole-record replace the central table licenses; with the preset replace writer gone,
    // its grants go stale.
    overlays: [neutralise("packages/server/src/domain/preset/persistence/queries.ts")],
    messageIncludes: "json-column-write-parity:preset-replace",
    grantConsumption: true,
  },
  {
    policy: knobWireCoverage,
    // A field on the real EffectiveAppConfig that no server behaviour reads.
    overlays: [
      edit(`${CONTRACTS}/settings/index.ts`, "export interface EffectiveAppConfig {\n", "export interface EffectiveAppConfig {\n  livenessGhost: number;\n"),
    ],
    messageIncludes: "livenessGhost",
  },
  {
    policy: messageKindPolicyCoverage,
    // An axis on the real MessageKindPolicy that no production code reads.
    overlays: [
      edit(
        `${CONTRACTS}/chat/participants.ts`,
        "export interface MessageKindPolicy {\n",
        'export interface MessageKindPolicy {\n  readonly livenessAxis: "a" | "b";\n',
      ),
    ],
    messageIncludes: "livenessAxis",
  },
];
