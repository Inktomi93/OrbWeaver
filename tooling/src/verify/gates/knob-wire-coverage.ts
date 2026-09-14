// Gate: knob-wire-coverage (D107) — the declared-knob-is-wired ratchet. A settings field/section/leaf, an
// `AppSettings` admin-editor key, a `DEFAULT_FORMAT_STRINGS` format string, or a `chatMetadataSchema` field
// that validates + stores but is never WRITTEN or never READ is a DEAD SWITCH: an edit silently governs
// nothing (the rateLimits dead-ended-pair, the permanently-OFF memory.enabled, the read-by-nobody
// dupThreshold). SEVEN BELTS, ONE POLICY, ONE SHARED WALK — the predicate, every member reader and every
// refusal live in `lib/knob-wire-fact.ts`; this module is the reporting and authority half.
//
// FAMILY: SINGLETON (`family` equals `id`). The fact provider it consumes has exactly one consumer, so
// there is no meaningful shared `lib/` callable or canonical vocabulary declaration reached from another
// policy's production hooks; the belts' member sources are four contract declarations nothing else judges.
//
// AUTHORITY = `reviewed-grant`, SEVERITY = `error`, and THE RECORDED SPLIT ARITY OF 2 IS AMENDED TO 1
// (law §2: "a ruled split arity is a claim about the current predicates"). The census
// (docs/reviews/gate-runtime/v-authority-census-2026-09-12.md:109) recorded "2 (sanctioned doorway ·
// warning debt)". DOORWAY-vs-DEFERRED is a DISPOSITION axis, not a predicate axis: the five DEFERRED rows
// scattered across arms A(2)/B(2)/B2(1) and the one DOORWAY row sat in F-write, so a split on that line
// would put the same member set and the same predicate in two policies and DOUBLE-REPORT every unwired
// knob. `contract-verb-presence` is the landed precedent for the identical shape — one reviewed-grant
// policy, its DEFERRED rows migrated to central grants (`lib/reviewed-grants.ts`).
//
// WHY `reviewed-grant` AND NOT `ordinary`: a reviewed identity is `(policyId, subject, operation)`
// authored on the finding, independent of source position. Arm F's write and read belts report the SAME
// authored node, and arms B2 and C both report an `appSettingsSchema` key's name node; law §6.2 forbids an
// ordinary policy promising independently waivable findings at an identical carrier+position, so the
// reviewed door is the only authority this predicate can honestly use.
//
// THE TWO-SIDED RATCHET SURVIVES, CENTRALLY. The legacy STALE arm (a member GAINED its wire but still
// carries an entry) and ORPHAN arm (an entry names a vanished member) are both the central
// `stale-reviewed-grant` alarm: a grant consumed zero times after a complete owner run is an error either
// way. The over-broad alarm is the third direction the tables never had. Driven in
// tests/tooling/verify/gates/knob-wire-family.test.ts.
//
// POPULATION PORT (bidirectional, measured — see the family test's `population port` case). LEGACY: no
// `scanRoot`, so the whole shared workspace Project, filtered by seven gate-local path regexes that between
// them match ONLY `packages/{contracts,server,client,ui}/src`. FINAL: those four roots as declared
// population algebra. `legacy − final` = every file outside those four roots, which the legacy gate loaded
// and every belt's scope predicate then rejected — EXCEPT the `identifierPresent` anchor sweep, which was
// project-wide; that narrowing is FORCED by law §3 (no project-wide traversal) and is classified, not
// hidden. `final − legacy` = EMPTY. Two legacy scope clauses were measured INERT and deleted: `!isTest(fp)`
// (`/\.test\.tsx?$/`) admits 0 of the 3284 `.ts`/`.tsx` files under the four roots because tests are
// central (constitution §0.2), and arm E's `!CONTRACTS_SRC.test(fp)` subtracted from a `SERVER_SRC` set the
// two regexes make disjoint.
//
// RETIRED PRIVATE-MARKER CENSUS: ZERO. This gate never owned a custom marker grammar and had ZERO live
// `@orb-gate-ignore knob-wire-coverage` occurrences on the tree (matching the exhaustive 2026-09-12 census
// table), so the legacy door is DEAD and nothing was translated. No nearby coordinate was manufactured.
//
// Full spec: docs/history/reviews/stickler/2026-07-25-knob-drift-gates.md; ruling: Core-Path-Registry.md
// D107; Spine-Config-and-Serialization.md §"Settings / config".
import { defineGate } from "../contract/policy.ts";
import { KNOB_WIRE_OPERATIONS, knobWireFact } from "../lib/knob-wire-fact.ts";

const SETTINGS = "packages/contracts/src/settings/index.ts";
const APPEARANCE = "packages/contracts/src/settings/appearance.ts";
const PRESET = "packages/contracts/src/preset/index.ts";
const METADATA = "packages/server/src/domain/chat/contract/metadata.ts";

const MESSAGE = (detail: string): string =>
  `${detail} — a declared knob wired to nothing is a dead switch (an edit silently governs nothing). Wire the missing half, or add a cited row to tooling/src/verify/lib/reviewed-grants.ts keyed on this policy, the member subject and its arm operation. Spine-Config-and-Serialization.md §7.2; Core-Path-Registry.md D107.`;

/** A settings head every fixture that must resolve `appSettingsSchema` or a leaf carries. */
const SETTINGS_HEAD = 'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\n';

function appSettings(initializer: string, extra = ""): string {
  return `${SETTINGS_HEAD}${extra}export const appSettingsSchema = ${initializer};\n`;
}

export const gate = defineGate({
  id: "knob-wire-coverage",
  family: "knob-wire-coverage",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@contracts", "@server", "@client", "@ui"],
  analysis: "types",
  execution: "entire-population",
  facts: [knobWireFact],
  resources: [],
  message:
    'a declared knob is wired to nothing — an `EffectiveAppConfig` field with no type-keyed server read, a `USER_SETTINGS_SECTIONS` member with no `section:"x"` write, an `appSettingsSchema` key absent from every admin write surface, a settings schema leaf nothing reads, a `DEFAULT_FORMAT_STRINGS` key no server behavior reads, or a `chatMetadataSchema` field with no write verb or no reader. Each finding anchors on the member\'s own authored name node in its contract, and its reviewed identity is (member subject, arm operation). Wire the missing half, or add a cited central reviewed grant. Core-Path-Registry.md D107.',
  fix: "wire the consumer/writer the finding names, or add a row to tooling/src/verify/lib/reviewed-grants.ts keyed on policyId `knob-wire-coverage`, the reported subject and the reported operation, with `why` and `endsWhen`; central liveness reds the row the moment the wire lands or the member disappears.",
  create: (ctx) => ({
    evaluate: () => {
      const population = ctx.fact(knobWireFact);
      const { fields, sections, appKeys, leaves, appearanceLeaves, formatStrings, metadataKeys } = population.counts;
      ctx.receipt({
        kind: "population",
        source: `knob-members[sources=${population.sources};fields=${fields};sections=${sections};appKeys=${appKeys};leaves=${leaves};appearanceLeaves=${appearanceLeaves};formatStrings=${formatStrings};metadataKeys=${metadataKeys}]`,
        members: population.members,
      });
      for (const candidate of population.candidates) {
        ctx.report.node(candidate.node, {
          subject: candidate.subject,
          operation: candidate.operation,
          token: candidate.token,
          offset: Math.max(candidate.node.getText().indexOf(candidate.token), 0),
          message: MESSAGE(candidate.detail),
        });
      }
    },
  }),
  mustFlag: [
    {
      // Arm A: an EffectiveAppConfig field with no typed server consumer.
      mode: "types",
      grant: { subject: "EffectiveAppConfig.ghostA", operation: KNOB_WIRE_OPERATIONS.configField },
      files: {
        [SETTINGS]: "export interface EffectiveAppConfig {\n  ghostA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts": "export const getEffectiveConfig = 1;\nexport const q = 2;\n",
      },
      expect: { count: 1, token: "ghostA", messageIncludes: "READ by no server behavior" },
      why: "arm A: an EffectiveAppConfig field resolved but read by no server behavior (the rateLimits dead-ended-pair); its reviewed identity is the qualified field and the unread-config-field operation",
    },
    {
      // Arm A (#1094 G2): an INHERITED EffectiveAppConfig field is a subject. PAIRED — the inline field IS
      // consumed and passes in this same tree, so only the composed half can produce the finding.
      mode: "types",
      grant: { subject: "EffectiveAppConfig.ghostInheritedA", operation: KNOB_WIRE_OPERATIONS.configField },
      files: {
        [SETTINGS]:
          "export interface GhostBaseProbe {\n  ghostInheritedA: number;\n}\nexport interface EffectiveAppConfig extends GhostBaseProbe {\n  wiredInlineA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts":
          'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ ghostInheritedA: 1, wiredInlineA: 1 });\nexport const use = getEffectiveConfig().wiredInlineA;\n',
      },
      expect: { count: 1, token: "ghostInheritedA", messageIncludes: "READ by no server behavior" },
      why: "arm A inherited-field red: a field EffectiveAppConfig inherits through `extends` is resolved config that owes a consumer — a local getProperties() read dropped it silently while the inline twin RED'd (#1094 G2). The finding anchors on the BASE interface's own member, which is where the fix lands.",
    },
    {
      // Arm B: a USER_SETTINGS_SECTIONS member with no section-patch write.
      mode: "types",
      grant: { subject: "USER_SETTINGS_SECTIONS.ghostB", operation: KNOB_WIRE_OPERATIONS.settingsSection },
      files: {
        [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = ["ghostB"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": "export const updateUserSettingsSection = 1;\n",
      },
      expect: { count: 1, token: "ghostB", messageIncludes: "no reachable section-patch write path" },
      why: "arm B: a section member with no client section-patch and no compose seed writer (the memory.enabled class)",
    },
    {
      // Arm B (#1094 G3): a section member arriving through a tuple SPREAD. PAIRED — the inline member has
      // its writer in this same tree.
      mode: "types",
      grant: { subject: "USER_SETTINGS_SECTIONS.ghostSpreadSection", operation: KNOB_WIRE_OPERATIONS.settingsSection },
      files: {
        [SETTINGS]:
          'export const GHOST_SECTIONS_PROBE = ["ghostSpreadSection"] as const;\nexport const USER_SETTINGS_SECTIONS = [...GHOST_SECTIONS_PROBE, "wiredInlineSection"] as const;\n',
        "packages/client/src/features/x/components/x.tsx":
          'export const updateUserSettingsSection = 1;\nexport const w = { section: "wiredInlineSection", patch: {} };\n',
      },
      expect: { count: 1, token: "ghostSpreadSection", messageIncludes: "no reachable section-patch write path" },
      why: "arm B spread red: a USER_SETTINGS_SECTIONS member composed through a spread is still an editor door that owes a write path — the direct-element reader dropped it while the inline twin RED'd (#1094 G3). The finding anchors on the CONTRIBUTING tuple's element, not on the spread that pulled it in.",
    },
    {
      // Arm B2: an appSettingsSchema key with no admin-surface write field. The arm-C read is placed in a
      // NON-admin client file, so arm C passes and the B2 needle is the only finding.
      mode: "types",
      grant: { subject: "appSettingsSchema.ghostB2", operation: KNOB_WIRE_OPERATIONS.adminKey },
      files: {
        [SETTINGS]: appSettings("z.object({ ghostB2: z.boolean() })"),
        "packages/client/src/features/settings/lib/x.ts": "export const somethingElse = 1;\n",
        "packages/client/src/features/other/x.ts": "declare const view: { ghostB2?: boolean };\nexport const a = view.ghostB2;\n",
      },
      expect: { count: 1, token: "ghostB2", messageIncludes: "no write field in the admin surfaces" },
      why: "arm B2: an AppSettings key absent from every admin write surface (a UI-less AppSettings) while a NON-admin client file reads it, so arm C is satisfied and this is the only finding — the admin-surface scope is what the row distinguishes",
    },
    {
      // Arm B2 (#1094 G4): an appSettingsSchema key arriving through an object SPREAD. Arm C flags both
      // keys here too (a bare identifier is not a read-shaped occurrence) — the B2 needle is the point.
      mode: "types",
      files: {
        [SETTINGS]: appSettings(
          "z.object({ ...GHOST_APP_SHAPE_PROBE, wiredInlineAppKey: z.boolean() })",
          "const GHOST_APP_SHAPE_PROBE = { ghostSpreadAppKey: z.boolean() };\n",
        ),
        "packages/client/src/features/settings/lib/x.ts": "export const wiredInlineAppKey = 1;\n",
      },
      expect: { count: 3, token: "ghostSpreadAppKey", messageIncludes: "no write field in the admin surfaces" },
      why: "arm B2 spread red: an AppSettings key composed through an object spread still owes an admin write field — the PropertyAssignment-only reader dropped it from arms B2 AND C while the inline twin RED'd (#1094 G4). THREE findings is the point: arms B2 and C report the SAME authored node for ghostSpreadAppKey and arm C also reports wiredInlineAppKey, which is why this policy's authority must be reviewed-grant (two distinct operations at one carrier) and why this row carries no grant witness.",
    },
    {
      // Arm C: a settings leaf read by nothing.
      mode: "types",
      files: {
        [SETTINGS]:
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = ["workloads"] as const;\nexport const s = z.object({ ghostLeaf: z.number() });\n',
        "packages/server/src/domain/x/x.ts": "export const unrelated = 1;\n",
      },
      expect: { count: 2, token: "ghostLeaf", messageIncludes: "dead from the schema down" },
      why: 'arm C: a distinctively-named settings leaf with no read-shaped occurrence anywhere (the dupThreshold class). The second finding is arm B on the unwritten "workloads" section in the same tree, which is why this row pins both a count and the arm-C token.',
    },
    {
      // Arm C: an imported settings sub-schema leaf read by nothing.
      mode: "types",
      grant: { subject: "userSettingsSchema.ghostAppearance", operation: KNOB_WIRE_OPERATIONS.settingsLeaf },
      files: {
        [SETTINGS]:
          'import { z } from "zod";\nimport { appearanceSettingsSchema } from "./appearance.ts";\nexport const USER_SETTINGS_SECTIONS = ["appearance"] as const;\nexport const userSettingsSchema = z.object({ schemaVersion: z.number(), appearance: appearanceSettingsSchema });\n',
        [APPEARANCE]: 'import { z } from "zod";\nexport const appearanceSettingsSchema = z.object({ ghostAppearance: z.number() }).prefault({});\n',
        "packages/client/src/features/x/x.tsx": 'export const updateUserSettingsSection = 1;\nexport const writer = { section: "appearance", patch: {} };\n',
      },
      expect: { count: 1, token: "ghostAppearance", messageIncludes: "dead from the schema down" },
      why: "arm C imported-schema red: a leaf moved behind the sanctioned appearance module boundary remains in the semantic consumer-liveness denominator, and the finding anchors in the SUB-SCHEMA module that declares it",
    },
    {
      // Arm C: a LOCAL settings leaf arriving through an object SPREAD (the same #1094 G4 miss, one arm
      // over: arm C was re-homed for the IMPORTED-MODULE axis and still under-read its own local spread).
      mode: "types",
      grant: { subject: "userSettingsSchema.ghostSpreadLeaf", operation: KNOB_WIRE_OPERATIONS.settingsLeaf },
      files: {
        [SETTINGS]:
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nconst GHOST_LEAF_SHAPE_PROBE = { ghostSpreadLeaf: z.number() };\nexport const s = z.object({ ...GHOST_LEAF_SHAPE_PROBE, wiredInlineLeaf: z.number() });\n',
        "packages/client/src/features/x/x.tsx": "declare const settings: { wiredInlineLeaf?: number };\nexport const consumed = settings.wiredInlineLeaf;\n",
      },
      expect: { count: 1, token: "ghostSpreadLeaf", messageIncludes: "dead from the schema down" },
      why: "arm C local-spread red: a leaf spread into a local z.object is in the semantic denominator — the inline twin is READ and passes in the same tree, so only the composed half can produce this finding",
    },
    {
      // Arm E: a DEFAULT_FORMAT_STRINGS key read by no server behavior.
      mode: "types",
      grant: { subject: "DEFAULT_FORMAT_STRINGS.ghostNudge", operation: KNOB_WIRE_OPERATIONS.formatString },
      files: {
        [PRESET]: 'export const presetSchema = 1;\nexport const DEFAULT_FORMAT_STRINGS = { ghostNudge: "x" } as const;\n',
        "packages/server/src/domain/chat/x.ts": "export const somethingElse = 1;\n",
      },
      expect: { count: 1, token: "ghostNudge", messageIncludes: "READ by no server behavior" },
      why: "arm E: an editable/importable format string nothing reads — a lie to the user and the ST importer",
    },
    {
      // Arm E: a DEFAULT_FORMAT_STRINGS key arriving through an object SPREAD (the same member-kind class —
      // arm E reads an `as const` map through the same authored-object reader).
      mode: "types",
      grant: { subject: "DEFAULT_FORMAT_STRINGS.ghostSpreadNudge", operation: KNOB_WIRE_OPERATIONS.formatString },
      files: {
        [PRESET]:
          'export const presetSchema = 1;\nconst GHOST_FORMATS_PROBE = { ghostSpreadNudge: "x" } as const;\nexport const DEFAULT_FORMAT_STRINGS = { ...GHOST_FORMATS_PROBE, wiredInlineNudge: "y" } as const;\n',
        "packages/server/src/domain/chat/x.ts":
          "declare const cfg: { formatStrings?: { wiredInlineNudge?: string } };\nexport const v = cfg.formatStrings?.wiredInlineNudge;\n",
      },
      expect: { count: 1, token: "ghostSpreadNudge", messageIncludes: "READ by no server behavior" },
      why: "arm E spread red: a format string composed through a spread is still editable/importable and owes a reader — the inline twin is read and passes in the same tree",
    },
    {
      // Arm F write: a chatMetadataSchema key with no write verb, whose READ belt is satisfied in the same
      // tree — so the write operation is the only finding and can carry the grant witness.
      mode: "types",
      grant: { subject: "chatMetadataSchema.ghostWriteMeta", operation: KNOB_WIRE_OPERATIONS.metadataWrite },
      files: {
        [METADATA]:
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ ghostWriteMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const noWrite = 1;\n",
        "packages/server/src/domain/chat/engine/x.ts": "declare const meta: { ghostWriteMeta?: number };\nexport const r = meta.ghostWriteMeta;\n",
      },
      expect: { count: 1, token: "ghostWriteMeta", messageIncludes: "no write verb" },
      why: "arm F write belt in isolation: the field IS read outside the parser and the write scope, so only the missing verb writer can produce this finding — the row that proves the write operation is independently bindable (the toolRecurseLimit class, its documentation lies)",
    },
    {
      // Arm F read: the mirror — a key a verb DOES write but nothing reads.
      mode: "types",
      grant: { subject: "chatMetadataSchema.ghostReadMeta", operation: KNOB_WIRE_OPERATIONS.metadataRead },
      files: {
        [METADATA]:
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ ghostReadMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const write = { ghostReadMeta: 1 };\n",
      },
      expect: { count: 1, token: "ghostReadMeta", messageIncludes: "never READ outside the parser" },
      why: "arm F read belt in isolation: a verb writes the field and nothing outside the parser + write scope reads it — dead parse weight. Paired with the write row above, this proves the two belts over ONE authored node carry two independently bindable reviewed identities, which is the whole reason this policy cannot be `ordinary`.",
    },
    {
      // Arm F: a chatMetadataSchema key with no write verb AND no read — BOTH belts fire on ONE node.
      mode: "types",
      files: {
        [METADATA]:
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ ghostMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const noWrite = 1;\n",
      },
      expect: { count: 2, token: "ghostMeta", messageIncludes: "no write verb" },
      why: "arm F both belts: one authored node, two findings, two operations. The legacy descriptor reported this pair at `<contract>:1:0` twice; the final pair shares a carrier AND a position, so law §6.2 rules out an ordinary waiver door and the reviewed `(subject, operation)` identity is what keeps them independently licensable.",
    },
    {
      // Arm F spread: a metadata key arriving through an object SPREAD, behind the live `.loose()` chain.
      // PAIRED — the inline key has both its write verb and its reader here.
      mode: "types",
      files: {
        [METADATA]:
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst GHOST_META_SHAPE_PROBE = { ghostSpreadMeta: z.number() };\nconst chatMetadataSchema = z.object({ ...GHOST_META_SHAPE_PROBE, wiredInlineMeta: z.number() }).loose();\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const write = { wiredInlineMeta: 1 };\n",
        "packages/server/src/domain/chat/engine/x.ts": "declare const meta: { wiredInlineMeta?: number };\nexport const r = meta.wiredInlineMeta;\n",
      },
      expect: { count: 2, token: "ghostSpreadMeta", messageIncludes: "no write verb" },
      why: "arm F spread red: a metadata field composed through a spread (under the live `.loose()` chain) still owes a writer and a reader — the inline twin satisfies both belts in the same tree, so only the composed half can produce these two findings",
    },
  ],
  mustPass: [
    {
      // Arm A: a typed consumer reads the field → passes.
      mode: "types",
      files: {
        [SETTINGS]: "export interface EffectiveAppConfig {\n  wiredA: number;\n}\n",
        "packages/server/src/entry/compose/x.ts":
          'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ wiredA: 1 });\nexport const use = getEffectiveConfig().wiredA;\n',
      },
      why: "arm A: a compose consumer reads the field off an EffectiveAppConfig-typed receiver — real consumption, passes",
    },
    {
      // Arm A: an INHERITED field WITH a typed consumer → passes. The value-fidelity half of the #1094 G2
      // pair: resolving the base must widen the subject set, never manufacture an accusation.
      mode: "types",
      files: {
        [SETTINGS]: "export interface GhostBaseProbe {\n  inheritedWiredA: number;\n}\nexport interface EffectiveAppConfig extends GhostBaseProbe {}\n",
        "packages/server/src/entry/compose/x.ts":
          'import type { EffectiveAppConfig } from "@orb/contracts/settings";\nexport const getEffectiveConfig = (): EffectiveAppConfig => ({ inheritedWiredA: 1 });\nexport const use = getEffectiveConfig().inheritedWiredA;\n',
      },
      why: "arm A inherited-field green: a base's field read off an EffectiveAppConfig-typed receiver is real consumption — the resolved-type reader must not accuse an inherited field that IS wired",
    },
    {
      // Arm B: a section member reached ONLY through a tuple spread, WITH its write path → passes.
      mode: "types",
      files: {
        [SETTINGS]:
          'export const SPREAD_SECTIONS_PROBE = ["wiredSpreadSection"] as const;\nexport const USER_SETTINGS_SECTIONS = [...SPREAD_SECTIONS_PROBE] as const;\n',
        "packages/client/src/features/x/components/x.tsx":
          'export const updateUserSettingsSection = 1;\nexport const w = { section: "wiredSpreadSection", patch: {} };\n',
      },
      why: "arm B spread green: the spread member resolves to its own NAME (not the spread's text), so its section-patch writer satisfies it — a reader returning anything else would accuse a wired section",
    },
    {
      // Arms B2 + C: the composed zod spellings the source law sanctions — an IMPORTED base schema reached
      // through `.extend`, and a `{ ...base.shape }` spread — with every key wired → passes.
      mode: "types",
      files: {
        "packages/contracts/src/settings/base-app.ts": 'import { z } from "zod";\nexport const baseAppSchema = z.object({ wiredBaseKey: z.boolean() });\n',
        [SETTINGS]:
          'import { z } from "zod";\nimport { baseAppSchema } from "./base-app.ts";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const appSettingsSchema = baseAppSchema.extend({ ...baseAppSchema.shape, wiredExtendKey: z.boolean() });\n',
        "packages/client/src/features/settings/lib/x.ts":
          "declare const view: { wiredBaseKey?: boolean; wiredExtendKey?: boolean };\nexport const a = view.wiredBaseKey;\nexport const b = view.wiredExtendKey;\n",
      },
      why: "arms B2/C composed green: an imported base through `.extend` plus a `{ ...base.shape }` re-spread resolves to exactly its two keys, and a spread that only RE-declares the base's key is a contribution (the tally counts declared members, not new ones) — never a zero-contribution refusal",
    },
    {
      // Arm B: a client section-patch writes the member → passes.
      mode: "types",
      files: {
        [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = ["wiredB"] as const;\n',
        "packages/client/src/features/x/components/x.tsx": 'export const updateUserSettingsSection = 1;\nexport const w = { section: "wiredB", patch: {} };\n',
      },
      why: 'arm B: a client mutation writes section:"wiredB" — the write path exists, passes',
    },
    {
      // Arm C: an imported settings sub-schema leaf with a production read → passes.
      mode: "types",
      files: {
        [SETTINGS]:
          'import { z } from "zod";\nimport { appearanceSettingsSchema } from "./appearance.ts";\nexport const USER_SETTINGS_SECTIONS = ["appearance"] as const;\nexport const userSettingsSchema = z.object({ schemaVersion: z.number(), appearance: appearanceSettingsSchema });\n',
        [APPEARANCE]: 'import { z } from "zod";\nexport const appearanceSettingsSchema = z.object({ wiredAppearance: z.number() }).prefault({});\n',
        "packages/client/src/features/x/x.tsx":
          'export const updateUserSettingsSection = 1;\nexport const writer = { section: "appearance", patch: {} };\ndeclare const appearance: { wiredAppearance: number };\nexport const consumed = appearance.wiredAppearance;\n',
      },
      why: "arm C imported-schema green: a consumed leaf behind the sanctioned appearance module boundary remains live",
    },
    {
      // Arm E: the format string is read (PropertyAccess) → passes; the dynamic-key form also passes.
      mode: "types",
      files: {
        [PRESET]: 'export const presetSchema = 1;\nexport const DEFAULT_FORMAT_STRINGS = { wiredNudge: "x" } as const;\n',
        "packages/server/src/domain/chat/x.ts":
          "declare const cfg: { formatStrings?: { wiredNudge?: string } };\nexport const v = cfg.formatStrings?.wiredNudge;\n",
      },
      why: "arm E: a server behavior reads cfg.formatStrings.wiredNudge — the belt is satisfied, passes",
    },
    {
      // Arm F: a verb writes the key AND a consumer reads it → both sub-belts pass.
      mode: "types",
      files: {
        [METADATA]:
          'import { z } from "zod";\nexport const parseChatMetadata = 1;\nconst chatMetadataSchema = z.object({ wiredMeta: z.number() });\nexport const s = chatMetadataSchema;\n',
        "packages/server/src/domain/chat/verbs/x.ts": "export const write = { wiredMeta: 1 };\n",
        "packages/server/src/domain/chat/engine/x.ts": "declare const meta: { wiredMeta?: number };\nexport const r = meta.wiredMeta;\n",
      },
      why: "arm F: a verb writes wiredMeta and the engine reads it — both write and read belts satisfied, passes",
    },
  ],
  mustRefuse: [
    {
      // THE PAIRED-ANCHOR TRIPWIRE, the successor to the legacy `was renamed away` mustFlag row. The legacy
      // descriptor reported it as an ordinary finding; a reviewed-grant finding is GRANTABLE, and a
      // permanent licence over a vacuous arm is exactly what the tripwire exists to prevent, so the
      // successor is an unsuppressible refusal (exit 2).
      mode: "types",
      files: {
        [SETTINGS]: "export const RENAMED_SECTIONS = [] as const;\nexport const x = 1;\n",
        "packages/client/src/features/x/x.tsx": "export const updateUserSettingsSection = 1;\n",
      },
      expect: { messageIncludes: "was renamed away, so the belt would go vacuous-green" },
      why: "the paired-anchor tripwire: the companion anchor survives but the member source symbol vanished — RED loudly and UNSUPPRESSIBLY, never vacuous-green and never grantable",
    },
    {
      mode: "types",
      files: { [SETTINGS]: "export interface EffectiveAppConfig extends MissingBaseProbe {\n  inlineProbe: number;\n}\n" },
      expect: { messageIncludes: "resolves to no interface declaration" },
      why: "an `extends` clause binding no interface REFUSES — inherited fields that cannot be enumerated are not zero fields",
    },
    {
      mode: "types",
      files: { [SETTINGS]: 'export const USER_SETTINGS_SECTIONS = [...MISSING_PROBE, "inlineSection"] as const;\n' },
      expect: { messageIncludes: "which no local declaration or named import binds" },
      why: "a section tuple spreading an identifier nothing binds REFUSES (through lib/tuple-read.ts's own vocabulary)",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings("z.object({ ...MISSING_PROBE })") },
      expect: { messageIncludes: "resolves to no local declaration or named import" },
      why: "a schema spread of an identifier nothing binds REFUSES rather than contributing zero keys",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings("z.object({ ...EMPTY_PROBE })", "const EMPTY_PROBE = {};\n") },
      expect: { messageIncludes: "contributed zero members" },
      why: "a spread contributing ZERO members REFUSES — an empty contribution is the silent-shrink shape",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings("FIRST_PROBE", "const FIRST_PROBE = SECOND_PROBE;\nconst SECOND_PROBE = FIRST_PROBE;\n") },
      expect: { messageIncludes: "composition cycle" },
      why: "a schema composition CYCLE refuses instead of recursing",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings("z.object({ a: z.boolean() }).pick({ a: true })") },
      expect: { messageIncludes: "unsupported appSettingsSchema schema method .pick()" },
      why: "a key-CHANGING schema method REFUSES — a narrowed key set is not the declared one",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings("buildAppSettings()") },
      expect: { messageIncludes: "unsupported appSettingsSchema expression" },
      why: "a builder this reader cannot model REFUSES rather than answering the empty set",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings('z.object({ probe() { return "x"; } })') },
      expect: { messageIncludes: "unsupported appSettingsSchema member kind MethodDeclaration" },
      why: "a METHOD member REFUSES — a member kind the reader cannot answer must never be dropped",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings('z.object({ get probe() { return "x"; } })') },
      expect: { messageIncludes: "unsupported appSettingsSchema member kind GetAccessor" },
      why: "a GETTER member refuses by its own kind",
    },
    {
      mode: "types",
      files: { [SETTINGS]: appSettings("z.object({ [probeKey]: z.boolean() })") },
      expect: { messageIncludes: "computed appSettingsSchema key" },
      why: "a COMPUTED key that is not a string literal REFUSES — a key this reader cannot name matches no wire",
    },
    {
      mode: "types",
      files: {
        [SETTINGS]:
          'import { z } from "zod";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nexport const userSettingsSchema = z.object({ schemaVersion: z.number() });\n',
      },
      expect: { messageIncludes: 'composes no "appearance" property' },
      why: "arm C's imported semantic-source manifest: a userSettingsSchema that composes no `appearance` property REFUSES — the manifest edge is unreachable and the leaf denominator would silently shrink",
    },
    {
      mode: "types",
      files: {
        [SETTINGS]:
          'import { z } from "zod";\nimport { appearanceSettingsSchema } from "./appearance.ts";\nexport const USER_SETTINGS_SECTIONS = [] as const;\nconst appearance = appearanceSettingsSchema;\nexport const userSettingsSchema = z.object({ appearance });\n',
        [APPEARANCE]: 'import { z } from "zod";\nexport const appearanceSettingsSchema = z.object({ leafProbe: z.number() });\n',
      },
      expect: { messageIncludes: "carries no readable schema expression" },
      why: "arm C's manifest again: composing `appearance` as a SHORTHAND refuses — a shorthand names no source, so the edge cannot be proved",
    },
  ],
});
