// The vocabulary of `pnpm unwired ports` targets: what a leg is asked to do, which leg owns a file, the concept
// members that derive from kit types, and how a cross-domain shape is classified against the ledger.
import { relative } from "node:path";
import ts from "typescript";
import type { ForeignTypes } from "./foreign-types.ts";
import { describeForeignTypes, passesDbHandle, runtimeTypes } from "./foreign-types.ts";
import type { PortMember, Restatement } from "./restated-port.ts";
import { placementOf, tierRank } from "./restated-port.ts";
import { jointBatchRulingOf } from "./ruled-ops.ts";

/** What a target asks its leg to do. The codemod applies {@link APPLIED_KINDS}; {@link INFORMATIONAL_KINDS} ask nothing;
 *  the others are judgment or hand work. */
export const TARGET_KINDS = [
  "ruled",
  "distinct",
  "derive",
  "derive-params",
  "concept",
  "add-door-export",
  "move-to-contracts",
  "split",
  "db-handle-review",
  "move-down",
  "name-owner-type",
  "forgotten-door-export",
  "hand",
  "review",
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** The kinds the derive codemod applies; every other kind is a leg's judgment or hand work. */
export const APPLIED_KINDS: ReadonlySet<TargetKind> = new Set<TargetKind>(["derive", "derive-params", "concept", "add-door-export"]);

/** The kinds that report a settled judgment and ask no work: a ledger-ruled joint batch, a registered distinct look-alike. */
export const INFORMATIONAL_KINDS: ReadonlySet<TargetKind> = new Set<TargetKind>(["ruled", "distinct"]);

/** The cluster legs, each owning one concept end to end: its owner and every consumer site. */
export const CLUSTER_GROUPS = ["character-ops", "platform", "retrieval", "tool-registry", "remaining-derives", "other"] as const;
export type ClusterGroup = (typeof CLUSTER_GROUPS)[number];

// The owning areas each concept cluster takes; a contracts area counts as the domain of the same name, so a derive
// against a contracts op folds into the cluster that owns the concept.
const AREA_GROUPS: ReadonlyMap<string, Exclude<ClusterGroup, "remaining-derives" | "other">> = new Map([
  ["character", "character-ops"],
  ["sessions", "platform"],
  ["admin", "platform"],
  ["workloads", "platform"],
  ["connection", "platform"],
  ["search", "retrieval"],
  ["embeddings", "retrieval"],
  ["stats", "retrieval"],
  ["tag", "retrieval"],
  ["tool-use", "tool-registry"],
]);

// The kinds a leg applies inside the consumer's own files: no contracts move, so they need no concept cluster.
const LOCAL_KINDS: ReadonlySet<TargetKind> = new Set<TargetKind>([
  "derive",
  "derive-params",
  "concept",
  "add-door-export",
  "move-down",
  "name-owner-type",
  "forgotten-door-export",
  "hand",
]);

/** The disjoint rewrite legs, by the file a target edits. */
export const LEGS = ["B", "C", "D", "E", "F"] as const;
export type Leg = (typeof LEGS)[number];

export const TARGET_FORMS = ["member", "collapse", "import", "export", "type"] as const;
export type TargetForm = (typeof TARGET_FORMS)[number];

export interface TargetImport {
  readonly name: string;
  readonly from: string;
}

/** An export the derive needs: `from` re-exports `name` through a door; `null` adds `export` to its declaration. */
export interface TargetExport {
  readonly file: string;
  readonly name: string;
  readonly from: string | null;
}

/** One member rewrite, one whole port collapsed into `Pick<Owner, …>`, one cross-domain import, or one named type.
 *  Lines are 1-based. */
export interface PlannedTarget {
  readonly leg: Leg;
  readonly kind: TargetKind;
  readonly form: TargetForm;
  readonly file: string;
  readonly line: number;
  /** The member, every member of a collapsed port in source order, or the names a cross-domain import takes. */
  readonly members: readonly string[];
  readonly port: string;
  readonly owner: string;
  readonly ownerAt: string;
  /** The replacement type text: a member's type, or a collapsed port's `Pick`. */
  readonly type: string | null;
  readonly imports: readonly TargetImport[];
  readonly exports: readonly TargetExport[];
  readonly note: string;
}

/** A planned target placed in its concept cluster. */
export interface PortTarget extends PlannedTarget {
  /** The owner's area and the concept: `character:getCard`. */
  readonly cluster: string;
  readonly clusterGroup: ClusterGroup;
  /** Why an `other` target sits outside every cluster leg; null for the others. */
  readonly groupReason: string | null;
}

const PACKAGE_SPECIFIER = /^@orb\/([^/]+)/u;
const CONTRACTS_AREA = /^packages\/contracts\/src\/([^/.]+)/u;
const SERVER_TIER = /^packages\/server\/src\/([^/]+)\//u;
const PACKAGE_AREA = /^packages\/([^/]+)\//u;

// The area that owns a file or a package specifier: a server domain, a contracts area, a server tier, a package.
function ownerArea(fileOrSpecifier: string): string {
  return (
    placementOf(`/${fileOrSpecifier}`)?.domain ??
    CONTRACTS_AREA.exec(fileOrSpecifier)?.[1] ??
    SERVER_TIER.exec(fileOrSpecifier)?.[1] ??
    PACKAGE_AREA.exec(fileOrSpecifier)?.[1] ??
    PACKAGE_SPECIFIER.exec(fileOrSpecifier)?.[1] ??
    fileOrSpecifier
  );
}

// The concept a target is about: the owner member (or the alias it is typed by), a collapsed port's home, or the type
// an import, a door or a forgotten export names.
function conceptName(target: PlannedTarget): string {
  if (target.form === "member" || (target.form === "type" && APPLIED_KINDS.has(target.kind))) {
    return target.owner.slice(target.owner.lastIndexOf(".") + 1);
  }
  if (target.form === "collapse") {
    return target.owner.slice(0, target.owner.indexOf("."));
  }
  return target.members[0] ?? target.owner;
}

// The group of the area that owns a concept. A contracts op, kit type or other shared home has no leg of its own, so
// a derive against it folds into the group of the domain whose file it edits.
function groupOf(area: string, ownerFile: string, file: string): ClusterGroup | undefined {
  const own = AREA_GROUPS.get(area);
  if (own !== undefined) {
    return own;
  }
  const shared = (placementOf(`/${ownerFile}`)?.domain ?? null) === null;
  const editing = placementOf(`/${file}`)?.domain ?? null;
  return shared && editing !== null ? AREA_GROUPS.get(editing) : undefined;
}

// The kinds no cluster leg works, each with the reason it sits in `other`.
const GROUP_REASONS: Partial<Readonly<Record<TargetKind, string>>> = {
  "db-handle-review": "the ledger rules each cross-domain db handle case on its own board item",
  review: "a shape-only match: a leg confirms one concept before any move",
  ruled: "a ruled crossing: a ledger-ruled joint batch or a consumer's split signature, no work",
  distinct: "a judged-distinct look-alike in distinct-lookalikes.ts, no work",
};

/** Place a target in its cluster by the area that owns its concept. */
export function clustered(target: PlannedTarget): PortTarget {
  // `ownerAt` is `file:line`, a list of them for an import, a file for a forgotten export, or a package specifier for
  // a concept; a door export is placed by the derive that needs it.
  const ownerFile = target.form === "export" ? target.file : (target.ownerAt.split(/[:,]/u)[0] ?? "");
  const area = ownerArea(ownerFile);
  const cluster = `${area}:${conceptName(target)}`;
  const reason = GROUP_REASONS[target.kind];
  if (reason !== undefined) {
    return { ...target, cluster, clusterGroup: "other", groupReason: reason };
  }
  const group = groupOf(area, ownerFile, target.file);
  if (group !== undefined) {
    return { ...target, cluster, clusterGroup: group, groupReason: null };
  }
  return LOCAL_KINDS.has(target.kind)
    ? { ...target, cluster, clusterGroup: "remaining-derives", groupReason: null }
    : { ...target, cluster, clusterGroup: "other", groupReason: `no cluster leg owns ${area}` };
}

// The named kit types a concept member derives from: a clock, a random draw, an id mint. Clock and random members
// are found by name anywhere; an id mint only where a flow already ties it to another mint.
const CONCEPTS = [
  { names: ["now", "nowMs", "nowEpochMs"], returns: ts.SyntaxKind.NumberKeyword, type: "Clock", from: "@orb/kit/time", sweep: true },
  { names: ["random", "prng", "rng", "nextRandom"], returns: ts.SyntaxKind.NumberKeyword, type: "RandomSource", from: "@orb/kit/macro", sweep: true },
  {
    names: ["newOpaqueId", "mintId", "newBackgroundEntryId", "newEntryId"],
    returns: ts.SyntaxKind.StringKeyword,
    type: 'IdSource["uuid"]',
    from: "@orb/kit/ids",
    sweep: false,
  },
  { names: ["item", "objective"], returns: ts.SyntaxKind.StringKeyword, type: 'IdSource["unprefixed"]', from: "@orb/kit/ids", sweep: false },
] as const;
export type Concept = (typeof CONCEPTS)[number];

export function conceptOf(member: PortMember): Concept | null {
  const type = ts.isPropertySignature(member) ? member.type : undefined;
  if (type === undefined || !ts.isFunctionTypeNode(type) || type.parameters.length > 0) {
    return null;
  }
  const name = member.name.getText();
  return CONCEPTS.find((concept) => (concept.names as readonly string[]).includes(name) && type.type.kind === concept.returns) ?? null;
}

const LEG_OF: readonly (readonly [RegExp, Leg])[] = [
  [/^packages\/server\/src\/(?:entry\/(?:http|boot|auth)|domain\/sessions)\//u, "B"],
  [/^packages\/server\/src\/(?:entry|transport)\//u, "C"],
  [/^packages\/server\/src\/domain\/chat\//u, "D"],
  [/^packages\/server\/src\//u, "E"],
];

export const legOf = (file: string): Leg => LEG_OF.find(([pattern]) => pattern.test(file))?.[1] ?? "F";

export interface Pair {
  readonly restating: string;
  readonly owner: string;
  readonly source: string;
  readonly relation: Restatement["relation"];
}

export interface Indexed {
  readonly key: string;
  readonly member: PortMember;
  readonly file: string;
  readonly line: number;
}

export const lineOf = (node: ts.Node): number => {
  const source = node.getSourceFile();
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
};

export const keyOf = (root: string, member: PortMember): string =>
  `${relative(root, member.getSourceFile().fileName)}:${lineOf(member)}:${member.name.getText()}`;

export const fileOfKey = (key: string): string => key.slice(0, key.indexOf(":"));

export const placementOfKey = (key: string): ReturnType<typeof placementOf> => placementOf(`/${fileOfKey(key)}`);

export function rankOfKey(key: string): number {
  const placement = placementOfKey(key);
  return placement === null ? Number.MAX_SAFE_INTEGER : tierRank(placement);
}

/** Why a cross-domain copy of a split signature is settled: a signature over contracts data and runtime types stays
 *  with its consumer, and the owner's verb satisfies it at the composition root. */
export const SPLIT_RULING = "a split signature (contracts data, runtime types from their owners) stays with its consumer";

/** What a joint-batch ruling may know a handle pass by: the op member, the type naming it and each alias it is typed
 *  by, and the domains the handle crosses between, one of which must be the ruled owner. */
export interface RulingKeys {
  readonly names: readonly string[];
  readonly domains: readonly (string | null)[];
}

/** A handle pass is ruled when `ruled-ops.ts` names one of its ops as built by one of its domains; every other
 *  handle pass is a defect to redesign. */
export function crossDomainKind(foreign: ForeignTypes, ruling: RulingKeys): TargetKind {
  if (passesDbHandle(foreign)) {
    return jointBatchRulingOf(ruling.names, ruling.domains) === null ? "db-handle-review" : "ruled";
  }
  return runtimeTypes(foreign).length > 0 ? "split" : "move-to-contracts";
}

export function crossDomainNote(kind: TargetKind, foreign: ForeignTypes, keys: RulingKeys): string {
  const ruled = passesDbHandle(foreign) ? jointBatchRulingOf(keys.names, keys.domains) : null;
  const unruled = kind === "db-handle-review" ? "ruling: unruled" : "";
  const ruling = ruled === null ? unruled : `ruling: ${ruled}`;
  return [describeForeignTypes(foreign), ruling].filter((part) => part !== "").join("; ");
}
