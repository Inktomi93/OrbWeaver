// Visitor-fed declared-knob/wire reconciliation for `knob-wire-coverage` (D107).
//
// SEVEN BELTS, ONE SHARED WALK. Each belt is a MEMBER SOURCE × CONSUMER SCOPE pair: A `EffectiveAppConfig`
// field × typed server read · B `USER_SETTINGS_SECTIONS` member × `section:"x"` write · B2 `appSettingsSchema`
// key × admin-surface write field · C settings schema leaf × read-shaped occurrence · E
// `DEFAULT_FORMAT_STRINGS` key × server read · F `chatMetadataSchema` key × write verb AND × read outside the
// parser/write scope. The belts are collected in ONE kind-indexed visitor pass instead of the legacy module's
// fifteen `getSourceFiles()`/`getDescendantsOfKind` sweeps.
//
// EVERY ARM FOLLOWS THE COMPOSITION ITS SOURCE LAW SANCTIONS OR REFUSES LOUDLY (#1094): A reads the
// interface's RESOLVED type, so an INHERITED `EffectiveAppConfig` field is a subject and an `extends` binding
// nothing refuses; B reads `lib/tuple-read.ts`, so a spread section member counts; B2/C/E/F share ONE
// authored-object reader that follows object spreads, `.shape` spreads, `.extend`/`.merge` and local/imported
// bindings, and throws on every other member kind, unbound binding, cycle, or zero-member contribution. Arm C
// also follows a precise imported semantic-source manifest for sanctioned sub-schema modules.
//
// THE DENOMINATOR IS NEVER SILENTLY SMALLER. A member population this reader cannot establish is a THROW
// (⇒ a fact error, exit 2), never a shorter list behind a green verdict; every belt's member count rides the
// returned value onto the consumer's population receipt. The paired-anchor rename tripwires are refusals
// here rather than findings — see `assertMemberSourcePresent`.
//
// SPLIT AT THE SIZE CAP (2026-09-18) along its own three sections: the MEMBER SOURCES (the shared
// authored-object reader, the interface/tuple readers, arm C's leaf population, the source constants and
// anchors) are `knob-wire-members.ts`; the CONSUMER CORPORA (per-file scope, the one-pass read/presence
// collection) are `knob-wire-corpora.ts`; the belts, the reconcile and the fact stay here. Both are leaves.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { Corpora, FileScope } from "./knob-wire-corpora.ts";
import { newCorpora, scopeOf, visitNode } from "./knob-wire-corpora.ts";
import {
  ANCHOR_GET_EFFECTIVE_CONFIG,
  ANCHOR_PARSE_METADATA,
  ANCHOR_PRESET_SCHEMA,
  ANCHOR_UPDATE_SECTION,
  APP_SETTINGS_SCHEMA,
  CHAT_METADATA_SCHEMA,
  DEFAULT_FORMAT_STRINGS,
  declaredMembers,
  EFFECTIVE_APP_CONFIG,
  interfaceFields,
  METADATA_PARSER,
  PRESET_CONTRACTS,
  SETTINGS_CONTRACTS,
  settingsLeaves,
  tupleMembers,
  USER_SETTINGS_SCHEMA,
  USER_SETTINGS_SECTIONS,
} from "./knob-wire-members.ts";

/** The arm vocabulary. `operation` is the reviewed-grant discriminator, so arm F's two belts over ONE
 *  authored node are independently licensable and §6.2's identical-carrier ban is never reached. */
export const KNOB_WIRE_OPERATIONS = {
  configField: "unread-config-field",
  settingsSection: "unwritten-settings-section",
  adminKey: "unwritten-admin-key",
  settingsLeaf: "unread-settings-leaf",
  formatString: "unread-format-string",
  metadataWrite: "unwritten-metadata-field",
  metadataRead: "unread-metadata-field",
} as const;

/** One unwired knob: its authored carrier, the member name, and the exact grant identity it binds. */
interface KnobWireCandidate {
  readonly node: Node;
  readonly token: string;
  readonly subject: string;
  readonly operation: string;
  readonly detail: string;
}

/** Every belt's resolved member count — the semantic denominator the verdict rests on. */
interface KnobWireCounts {
  readonly fields: number;
  readonly sections: number;
  readonly appKeys: number;
  readonly leaves: number;
  readonly appearanceLeaves: number;
  readonly formatStrings: number;
  readonly metadataKeys: number;
}

export interface KnobWirePopulation {
  readonly candidates: readonly KnobWireCandidate[];
  readonly counts: KnobWireCounts;
  /** Members judged across all seven belts (arm F counts its keys twice — two belts, two obligations). */
  readonly members: number;
  /** Member-source declarations that resolved (settings · preset · metadata · imported sub-schemas). */
  readonly sources: number;
}

// ── the per-belt reconcile ──────────────────────────────────────────────────────────────────────────────
interface Belt {
  readonly members: readonly (readonly [string, Node])[];
  readonly wired: ReadonlySet<string>;
  readonly operation: string;
  readonly subjectOf: (member: string) => string;
  readonly detailOf: (member: string) => string;
}

function runBelt(belt: Belt, into: KnobWireCandidate[]): number {
  for (const [member, node] of belt.members) {
    if (!belt.wired.has(member)) {
      into.push({ node, token: member, subject: belt.subjectOf(member), operation: belt.operation, detail: belt.detailOf(member) });
    }
  }
  return belt.members.length;
}

/** A member source that VANISHED while its companion anchor survived is a renamed-away source, and the belt
 *  would go vacuous-green over it. The legacy descriptor reported that as an ordinary finding; a finding of a
 *  `reviewed-grant` policy is grantable, and a permanent licence over a vacuous arm is precisely the failure
 *  the tripwire exists to prevent — so the successor is an UNSUPPRESSIBLE refusal (exit 2), the same class as
 *  every other "this denominator cannot be established" arm in this reader. Content-guarded on the anchor, so
 *  a synthetic mini-tree lacking both never fires it. */
function assertMemberSourcePresent(memberCount: number, anchor: string, source: string, corpora: Corpora): void {
  if (memberCount === 0 && corpora.identifiers.has(anchor)) {
    throw new Error(
      `knob-wire-coverage: the ${anchor} companion anchor is present but the ${source} member source is not — it was renamed away, so the belt would go vacuous-green. Re-point the member source in tooling/src/verify/lib/knob-wire-fact.ts (path-keyed-gates-die-on-rename; D107).`,
    );
  }
}

function reconcile(files: readonly SourceFile[], corpora: Corpora): KnobWirePopulation {
  const settings = files.find((sf) => SETTINGS_CONTRACTS.test(sf.getFilePath()));
  const preset = files.find((sf) => PRESET_CONTRACTS.test(sf.getFilePath()));
  const metadata = files.find((sf) => METADATA_PARSER.test(sf.getFilePath()));

  const candidates: KnobWireCandidate[] = [];
  let members = 0;
  let sources = 0;
  let fields = 0;
  let sections = 0;
  let appKeys = 0;
  let leaves = 0;
  let appearanceLeaves = 0;
  let formatStrings = 0;
  let metadataKeys = 0;

  if (settings !== undefined) {
    sources += 1;
    const fieldMembers = interfaceFields(settings, EFFECTIVE_APP_CONFIG);
    const sectionMembers = tupleMembers(settings, USER_SETTINGS_SECTIONS);
    const appKeyMembers = [...declaredMembers(settings, APP_SETTINGS_SCHEMA)].map(([name, member]): readonly [string, Node] => [name, member.nameNode]);
    const leafPopulation = settingsLeaves(settings, corpora.settingsCalls, new Set(sectionMembers.map(([name]) => name)));
    assertMemberSourcePresent(fieldMembers.length, ANCHOR_GET_EFFECTIVE_CONFIG, EFFECTIVE_APP_CONFIG, corpora);
    assertMemberSourcePresent(sectionMembers.length, ANCHOR_UPDATE_SECTION, USER_SETTINGS_SECTIONS, corpora);
    fields = runBelt(
      {
        members: fieldMembers,
        wired: corpora.configReads,
        operation: KNOB_WIRE_OPERATIONS.configField,
        subjectOf: (member) => `${EFFECTIVE_APP_CONFIG}.${member}`,
        detailOf: (member) => `${EFFECTIVE_APP_CONFIG}.${member} is resolved (env floor ⊕ admin override) but READ by no server behavior`,
      },
      candidates,
    );
    sections = runBelt(
      {
        members: sectionMembers,
        wired: corpora.sectionWrites,
        operation: KNOB_WIRE_OPERATIONS.settingsSection,
        subjectOf: (member) => `${USER_SETTINGS_SECTIONS}.${member}`,
        detailOf: (member) => `${USER_SETTINGS_SECTIONS} "${member}" has no reachable section-patch write path (client or compose seed)`,
      },
      candidates,
    );
    appKeys = runBelt(
      {
        members: appKeyMembers,
        wired: corpora.adminNames,
        operation: KNOB_WIRE_OPERATIONS.adminKey,
        subjectOf: (member) => `${APP_SETTINGS_SCHEMA}.${member}`,
        detailOf: (member) => `${APP_SETTINGS_SCHEMA} key "${member}" has no write field in the admin surfaces (features/config ∪ user-admin)`,
      },
      candidates,
    );
    leaves = runBelt(
      {
        members: leafPopulation.leaves,
        wired: corpora.settingsReads,
        operation: KNOB_WIRE_OPERATIONS.settingsLeaf,
        subjectOf: (member) => `${USER_SETTINGS_SCHEMA}.${member}`,
        detailOf: (member) => `settings schema leaf "${member}" is READ by nothing — the knob is dead from the schema down (the dupThreshold class)`,
      },
      candidates,
    );
    appearanceLeaves = leafPopulation.importedLeafCount;
    sources += leafPopulation.importedSources;
    members += fields + sections + appKeys + leaves;
  }

  if (preset !== undefined) {
    sources += 1;
    const formatMembers = [...declaredMembers(preset, DEFAULT_FORMAT_STRINGS)].map(([name, member]): readonly [string, Node] => [name, member.nameNode]);
    assertMemberSourcePresent(formatMembers.length, ANCHOR_PRESET_SCHEMA, DEFAULT_FORMAT_STRINGS, corpora);
    formatStrings = runBelt(
      {
        members: formatMembers,
        wired: corpora.presetReads,
        operation: KNOB_WIRE_OPERATIONS.formatString,
        subjectOf: (member) => `${DEFAULT_FORMAT_STRINGS}.${member}`,
        detailOf: (member) =>
          `${DEFAULT_FORMAT_STRINGS}.${member} is an editable/importable format string READ by no server behavior — a lie to the user and the ST importer`,
      },
      candidates,
    );
    members += formatStrings;
  }

  if (metadata !== undefined) {
    sources += 1;
    const metaMembers = [...declaredMembers(metadata, CHAT_METADATA_SCHEMA)].map(([name, member]): readonly [string, Node] => [name, member.nameNode]);
    assertMemberSourcePresent(metaMembers.length, ANCHOR_PARSE_METADATA, CHAT_METADATA_SCHEMA, corpora);
    metadataKeys = runBelt(
      {
        members: metaMembers,
        wired: corpora.metadataWrites,
        operation: KNOB_WIRE_OPERATIONS.metadataWrite,
        subjectOf: (member) => `${CHAT_METADATA_SCHEMA}.${member}`,
        detailOf: (member) =>
          `${CHAT_METADATA_SCHEMA}.${member} has no write verb (domain/chat/verbs ∪ transport/trpc) — a metadata field whose documentation lies`,
      },
      candidates,
    );
    runBelt(
      {
        members: metaMembers,
        wired: corpora.metadataReads,
        operation: KNOB_WIRE_OPERATIONS.metadataRead,
        subjectOf: (member) => `${CHAT_METADATA_SCHEMA}.${member}`,
        detailOf: (member) => `${CHAT_METADATA_SCHEMA}.${member} is never READ outside the parser + write scope — dead parse weight`,
      },
      candidates,
    );
    members += metadataKeys * 2;
  }

  return {
    candidates,
    counts: { fields, sections, appKeys, leaves, appearanceLeaves, formatStrings, metadataKeys },
    members,
    sources,
  };
}

/** The kinds every belt's corpus is derived from. `CallExpression` is arm C's local leaf source; the two
 *  property kinds carry the `section: "x"` write literal; the rest are the read/presence shapes. */
const KNOB_WIRE_KINDS = [
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.BindingElement,
  SyntaxKind.ElementAccessExpression,
  SyntaxKind.StringLiteral,
  SyntaxKind.Identifier,
  SyntaxKind.CallExpression,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.PropertySignature,
] as const;

export const knobWireFact = defineFact({
  id: "knob-wire-coverage",
  population: ["@contracts", "@server", "@client", "@ui"],
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const corpora = newCorpora();
    const scopes = new Map<string, FileScope>();
    const scopeFor = (sourceFile: SourceFile): FileScope => {
      const path = sourceFile.getFilePath();
      const hit = scopes.get(path);
      if (hit !== undefined) {
        return hit;
      }
      const scope = scopeOf(path);
      scopes.set(path, scope);
      return scope;
    };
    return {
      visitors: [{ kinds: [...KNOB_WIRE_KINDS], visit: (node, sourceFile) => visitNode(node, scopeFor(sourceFile), corpora) }],
      finish: (): KnobWirePopulation => {
        ctx.receipt({ kind: "population", source: "knob-wire-corpus-files", members: ctx.files.length });
        return reconcile(ctx.files, corpora);
      },
    };
  },
});
