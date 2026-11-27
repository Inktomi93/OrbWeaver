// Members with no production caller on purpose: an external caller reaches them. Every scan reports these apart
// from the unwired members, each with its reason, through sortDeliberate. `member: null` covers every member of the home, and a
// `directory` entry covers every home of every file under it.
//
// - An entry is stale when its file, home or member is gone from the tree (staleDeliberate, which every consuming scan
//   reports), or when it excuses no finding in any consuming scan (excusedNothing, which reads every consumer's report
//   and judges only when all were written from one root, at HEAD or at a commit only prose separates from it). Each
//   reason's cites resolve through the comment cite grammar (tests/tooling/doc/comment-path-citations.repo.int.test.ts).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { runGit } from "../floor/git/git.ts";
import type { JudgedEntry, JudgedSplit } from "./judged.ts";
import { sortJudged } from "./judged.ts";

/** One home's members, or with `member: null` all of them; or every home under a `directory`. */
export type DeliberateEntry =
  | { readonly file: string; readonly home: string; readonly member: string | null; readonly reason: string }
  | { readonly directory: string; readonly reason: string };

const AGENT_CALLED =
  "the dev-only `globalThis.__orb` agent bridge: browser-driving agents call this accessor through `--eval` and scenario scripts, and no typed caller in the tree does";
const AGENT_READ =
  "the dev-only `globalThis.__orb` agent bridge: browser-driving agents read this result member through `--eval` and scenario scripts, and no typed reader in the tree does";
const AGENT_PROJECTION =
  "the dev-only `globalThis.__orb` agent bridge: the tooling reads this record through its own validated projection of it, whose members the client declaration does not own";
const SETTLE_SIGNAL = "docs/law/Spine-Testing.md: a suite waits on the composed root's actual settle signal, never a delay";
const PUBLISHED_API = "D266: the published plugin SDK surface; guest plugins outside the tree read and write it";
const DORMANT_AGENTS = "D60: the design of record for agent principals; the admin view carries an agent's kind and owner for that rebuild";
const KIND_PER_USE = "D350: the asset list carries every kind an asset is used as";
const RAW_KV_INSERT =
  "packages/server/src/domain/plugin/persistence/plugin-kv.ts creates a row only through one raw INSERT … SELECT, so the per-plugin key cap rides the write as a subquery (.claude/rules/db.md, Writes); raw SQL text is no column site";
const ROSTER_PRESET_OPS =
  "an op type that `domain/roster-preset` (and for `AddCharacterToChatOp` `domain/rpg`) is injected with names it in its signature, so it stays in `@orb/contracts` rather than a domain `contract/params.ts`";
const FORENSIC_AUDIT =
  "docs/law/Tier-1-DB.md: the audit log is a database-only forensic record; the app writes it and an operator reads it with database tools on a copy of the file";
const CARD_ROUND_TRIP =
  "docs/law/Spine-Config-and-Serialization.md: a card round-trips import to export unchanged, so the V3 media manifest is parsed and carried on `residualData` for export to re-emit, and no consumer reads it by key";
const PLUGIN_RAW_METADATA = "owner ruling 2026-11-27: the plugin provider's raw metadata stays";
const STATED_REASON = "D107: a declared field is wired or cites its reason, and this one is where its registry row states that reason";
const CONTENT_CLASS_PAIR =
  ".claude/rules/chat.md: the content-class policy table and its dispatch in spanToWirePart are edited together, and `wire` is the table's side of that pair";

export const DELIBERATE: readonly DeliberateEntry[] = [
  { directory: "packages/contracts/src/plugin/", reason: PUBLISHED_API },
  { directory: "packages/plugin-sdk/", reason: PUBLISHED_API },
  { file: "packages/db/src/schema/audit.ts", home: "auditLogs", member: null, reason: FORENSIC_AUDIT },
  { file: "packages/contracts/src/character/index.ts", home: "characterCardDataFields", member: "assets", reason: CARD_ROUND_TRIP },
  { file: "packages/contracts/src/chat/messages.ts", home: "pluginProviderMetadataSchema", member: "raw", reason: PLUGIN_RAW_METADATA },
  { file: "packages/contracts/src/automation/index.ts", home: "triggerFactPayloadSchema", member: null, reason: PUBLISHED_API },
  { file: "packages/contracts/src/automation/index.ts", home: "ListRulesParams", member: null, reason: `ListRulesOp is ${ROSTER_PRESET_OPS}` },
  { file: "packages/contracts/src/automation/index.ts", home: "DeleteRuleParams", member: null, reason: `DeleteRuleOp is ${ROSTER_PRESET_OPS}` },
  { file: "packages/contracts/src/chat/seat-ops.ts", home: "AddCharacterToChatParams", member: null, reason: `AddCharacterToChatOp is ${ROSTER_PRESET_OPS}` },
  {
    file: "packages/contracts/src/chat/owner-ops.ts",
    home: "ChatScopedParams",
    member: null,
    reason: `the base of SetGroupConfigParams, AddCharacterToChatParams and SetSeatKnobsParams, whose ops are ${ROSTER_PRESET_OPS}`,
  },
  { file: "packages/contracts/src/identity/index.ts", home: "AdminUserView", member: "kind", reason: DORMANT_AGENTS },
  { file: "packages/contracts/src/identity/index.ts", home: "AdminUserView", member: "ownerHandle", reason: DORMANT_AGENTS },
  { file: "packages/contracts/src/assets/index.ts", home: "AssetListItem", member: "kinds", reason: KIND_PER_USE },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "ThemeFallbackRing", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "MotionSnapshot", member: "worstBlocking", reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "MotionSnapshot", member: "worstShift", reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "MotionFlagRecord", member: "at", reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "MotionFlagRecord", member: "overBudget", reason: AGENT_READ },
  { file: "packages/ui/src/lib/css-merge-contract.ts", home: "CssMergeReceipt", member: "input", reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "isReady", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "themeFallbacks", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "resetFlags", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "pluginLog", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "pluginUi", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "automationFires", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "durableLocalUserId", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "rpg", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "seed", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "capabilities", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbDebugHandle", member: "rings", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbNavHandle", member: "corpusMode", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbNavHandle", member: "closeModal", reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbSeedHandle", member: null, reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "SEED_PROFILES", member: null, reason: AGENT_CALLED },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginLogLine", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginPublication", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiHost", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiSurface", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiCommand", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiEntry", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-plugin-bridge.ts", home: "OrbPluginUiSnapshot", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "AppearanceMatrixBridgeContract", member: null, reason: AGENT_PROJECTION },
  { file: "packages/kit/src/appearance-manifest/index.ts", home: "AppearanceMessageRegistryReceipt", member: null, reason: AGENT_PROJECTION },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "QuerySummary", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbNavCapabilities", member: null, reason: AGENT_PROJECTION },
  { file: "packages/client/src/lib/agent-bridge-handles.ts", home: "OrbRpgSnapshot", member: null, reason: AGENT_READ },
  { file: "packages/client/src/lib/agent-bridge-contract.ts", home: "OrbRingMetadata", member: null, reason: AGENT_READ },
  { file: "packages/db/src/schema/plugin.ts", home: "pluginKv", member: "pluginId", reason: RAW_KV_INSERT },
  { file: "packages/db/src/schema/plugin.ts", home: "pluginKv", member: "ownerId", reason: RAW_KV_INSERT },
  { file: "packages/db/src/schema/plugin.ts", home: "pluginKv", member: "key", reason: RAW_KV_INSERT },
  { file: "packages/server/src/entry/compose/services.ts", home: "ServicesResult", member: "settleBackground", reason: SETTLE_SIGNAL },
  { file: "packages/server/src/domain/share/contract/composition.ts", home: "ShareGraph", member: "settle", reason: SETTLE_SIGNAL },
  { file: "packages/contracts/src/chat/content-classes.ts", home: "ContentClassPolicy", member: "wire", reason: CONTENT_CLASS_PAIR },
  { file: "packages/client/src/state/device-local-registry.ts", home: "DeviceLocalClassification", member: "why", reason: STATED_REASON },
  { file: "packages/client/src/state/config-section-partition.ts", home: "UnclaimedSettingsKey", member: "reason", reason: STATED_REASON },
];

/** The label an entry is reported under: its directory, or its file, home and member (`*` for every member). */
export const deliberateLabel = (entry: DeliberateEntry): string =>
  "directory" in entry ? entry.directory : `${entry.file}:${entry.home}.${entry.member ?? ANY_MEMBER}`;
const ANY_MEMBER = "*";

// The entry that excuses `member` of `home` in `file`, if any.
function deliberateEntry(entries: readonly DeliberateEntry[], file: string, home: string, member: string): DeliberateEntry | null {
  return (
    entries.find((entry) =>
      "directory" in entry
        ? file.startsWith(entry.directory)
        : entry.file === file && entry.home === home && (entry.member === null || entry.member === member),
    ) ?? null
  );
}

/** A file, home and member the deliberate list is asked about. */
export interface DeliberateSide {
  readonly file: string;
  readonly home: string;
  readonly member: string;
}

/** Split findings into the unwired and the ones the deliberate list excuses, each of those with its reason. A finding
 *  that stands for several declarations, as a restated pair does, names each through `sides`; any excused side
 *  excuses it. */
export function sortDeliberate<Finding extends DeliberateSide>(
  findings: readonly Finding[],
  entries: readonly DeliberateEntry[],
  sides: (finding: Finding) => readonly DeliberateSide[] = (finding) => [finding],
): { readonly unwired: readonly Finding[]; readonly deliberate: readonly (Finding & DeliberateMark)[] } {
  const unwired: Finding[] = [];
  const deliberate: (Finding & DeliberateMark)[] = [];
  for (const finding of findings) {
    const entry = sides(finding)
      .map((side) => deliberateEntry(entries, side.file, side.home, side.member))
      .find((found) => found !== null);
    if (entry === undefined) {
      unwired.push(finding);
    } else {
      deliberate.push({ ...finding, reason: entry.reason, entry: deliberateLabel(entry) });
    }
  }
  return { unwired, deliberate };
}

/** What a deliberate row carries: the excusing entry's reason, and its label, which the excused-nothing check reads. */
export interface DeliberateMark {
  readonly reason: string;
  readonly entry: string;
}

const STALE_KINDS = ["file-gone", "home-gone", "member-gone", "excuses-nothing"] as const;
/** `file-gone`: no file at the entry's path, or a directory that holds none. `home-gone`: the file declares no top-level
 *  binding of the home's name. `member-gone`: the home's own declaration names no such member. `excuses-nothing`: no
 *  consuming scan's report applied the entry. */
type StaleDeliberateKind = (typeof STALE_KINDS)[number];

/** A deliberate entry the list must drop or repoint. */
export interface StaleDeliberate {
  readonly entry: string;
  readonly stale: StaleDeliberateKind;
}

const holdsFile = (path: string): boolean =>
  existsSync(path) && statSync(path).isDirectory() && readdirSync(path, { recursive: true, withFileTypes: true }).some((item) => item.isFile());

// The top-level declarations of a file under a name, as written: an interface, type, class, function, enum or variable.
function declarationsNamed(source: ts.SourceFile, name: string): readonly ts.Node[] {
  return source.statements.flatMap((statement): ts.Node[] => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
    }
    const named =
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isEnumDeclaration(statement);
    return named && statement.name?.text === name ? [statement] : [];
  });
}

// The member names a home's own declaration spells, or null when its members come from a type it only refers to (an
// alias of `Omit<…>`, a function's return): those the checker would have to read, so no member is judged gone.
function spelledMembers(declaration: ts.Node): ReadonlySet<string> | null {
  const names = new Set<string>();
  const keyOf = (name: ts.PropertyName | undefined): void => {
    if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name))) {
      names.add(name.text);
    }
  };
  // True when this node or one below it spells a member list.
  const visit = (node: ts.Node): boolean => {
    let readable = false;
    if (ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
      readable = true;
      for (const member of node.members) {
        keyOf(member.name);
      }
    } else if (ts.isObjectLiteralExpression(node)) {
      readable = true;
      for (const property of node.properties) {
        keyOf(property.name);
      }
    }
    if (!ts.isTypeReferenceNode(node)) {
      // Block body: a truthy callback result stops forEachChild.
      ts.forEachChild(node, (child) => {
        readable = visit(child) || readable;
      });
    }
    return readable;
  };
  return visit(declaration) ? names : null;
}

/** The entries whose file, home or member the tree at `root` no longer declares. */
export function staleDeliberate(root: string, entries: readonly DeliberateEntry[]): readonly StaleDeliberate[] {
  const sources = new Map<string, ts.SourceFile | null>();
  const sourceOf = (file: string): ts.SourceFile | null => {
    if (!sources.has(file)) {
      const path = join(root, file);
      sources.set(file, existsSync(path) ? ts.createSourceFile(file, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true) : null);
    }
    return sources.get(file) ?? null;
  };
  return entries.flatMap((entry): StaleDeliberate[] => {
    const label = deliberateLabel(entry);
    if ("directory" in entry) {
      return holdsFile(join(root, entry.directory)) ? [] : [{ entry: label, stale: "file-gone" }];
    }
    const source = sourceOf(entry.file);
    if (source === null) {
      return [{ entry: label, stale: "file-gone" }];
    }
    const declarations = declarationsNamed(source, entry.home);
    if (declarations.length === 0) {
      return [{ entry: label, stale: "home-gone" }];
    }
    const { member } = entry;
    const spelled = declarations.map(spelledMembers);
    const gone = member !== null && spelled.every((names) => names !== null && !names.has(member));
    return gone ? [{ entry: label, stale: "member-gone" }] : [];
  });
}

/** What a consuming scan records beside its report: the tree it read and the deliberate entries it applied. */
export interface DeliberateRun {
  readonly root: string;
  readonly head: string;
  readonly applied: readonly string[];
}

/** A consumer's report as the excused-nothing check reads it: its path, and its run block, or null for none. */
export interface ConsumerReport {
  readonly path: string;
  readonly run: DeliberateRun | null;
}

// Prose no scan reads: a commit that changes only these leaves every report's findings as they were.
const PROSE_DIRECTORY = "docs/";
const PROSE_EXTENSION = ".md";

// Whether every file that differs between two commits is prose; false when either commit is unknown to the root.
function onlyProseBetween(root: string, from: string, to: string): boolean {
  const diff = runGit(root, ["diff", "--name-only", "--no-renames", from, to]);
  return diff.status === 0 && diff.stdout.split("\n").every((file) => file === "" || file.startsWith(PROSE_DIRECTORY) || file.endsWith(PROSE_EXTENSION));
}

/** The entries no consumer applied, or the reports that keep the check from judging: a missing report, one with no run
 *  block, one another root wrote, or one whose HEAD differs from the current one by more than prose. */
export function excusedNothing(
  entries: readonly DeliberateEntry[],
  reports: readonly ConsumerReport[],
  current: { readonly root: string; readonly head: string },
): { readonly stale: readonly StaleDeliberate[]; readonly unjudged: readonly string[] } {
  const judged = (run: DeliberateRun | null): boolean =>
    run !== null && run.root === current.root && (run.head === current.head || onlyProseBetween(current.root, run.head, current.head));
  const unjudged = reports.filter(({ run }) => !judged(run)).map(({ path }) => path);
  if (unjudged.length > 0) {
    return { stale: [], unjudged };
  }
  const applied = new Set(reports.flatMap(({ run }) => run?.applied ?? []));
  return {
    stale: entries.map(deliberateLabel).flatMap((entry): StaleDeliberate[] => (applied.has(entry) ? [] : [{ entry, stale: "excuses-nothing" }])),
    unjudged: [],
  };
}

/** {@link sortDeliberate}, then the judged list over what it leaves: every bucket a report without rulings of its own
 *  writes. */
export function sortRows<Finding extends DeliberateSide & { readonly key: string }>(
  findings: readonly Finding[],
  options: { readonly root: string; readonly deliberate: readonly DeliberateEntry[]; readonly judged?: readonly JudgedEntry[] | undefined },
): JudgedSplit<Finding> & { readonly deliberate: readonly (Finding & DeliberateMark)[] } {
  const { unwired, deliberate } = sortDeliberate(findings, options.deliberate);
  return { ...sortJudged(unwired, options), deliberate };
}
