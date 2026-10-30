// The vocabulary of `pnpm unwired ports` targets: what a leg is asked to do, which leg owns a file, the concept
// members that derive from kit types, and how a cross-domain shape is classified against the ledger.
import { relative } from "node:path";
import ts from "typescript";
import type { ForeignTypes } from "./foreign-types.ts";
import { describeForeignTypes, passesDbHandle, runtimeTypes } from "./foreign-types.ts";
import type { PortMember, Restatement } from "./restated-port.ts";
import { placementOf, tierRank } from "./restated-port.ts";

/** What a target asks its leg to do. The codemod applies {@link APPLIED_KINDS}; the others are judgment or hand work. */
export const TARGET_KINDS = [
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
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** The kinds the derive codemod applies; every other kind is a leg's judgment or hand work. */
export const APPLIED_KINDS: ReadonlySet<TargetKind> = new Set<TargetKind>(["derive", "derive-params", "concept", "add-door-export"]);

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

/** One member rewrite, one whole port collapsed into `Pick<Owner, …>`, or one cross-domain import. Lines are 1-based. */
export interface PortTarget {
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

// The joint batches the ledger rules, by the owner member or imported name that hands a statement or handle across
// domains. Every other db-handle pass is unruled: a defect to redesign, each with its own item.
const DB_HANDLE_RULINGS: ReadonlyMap<string, string> = new Map([
  ["SessionsService.signupUserStatement", "D259 (signup invite mints the account, persona and seat in one gated batch)"],
  ["PendingSignupPlan.statements", "D259 (the OIDC pending-join confirm runs the same gated batch)"],
  ["ChatRpgGameBirthPlan", "D264 (startChat births the game in chat's creation batch through rpg's planGameBirth)"],
  ["SessionsService", "D257 for localUserInsertStatement (admin's mint in its audited batch); revokeAllForUserStatement and linkExternalIdStatement unruled"],
]);

export function crossDomainKind(foreign: ForeignTypes): TargetKind {
  if (passesDbHandle(foreign)) {
    return "db-handle-review";
  }
  return runtimeTypes(foreign).length > 0 ? "split" : "move-to-contracts";
}

export function crossDomainNote(kind: TargetKind, foreign: ForeignTypes, rulingKeys: readonly string[]): string {
  const ruling =
    kind === "db-handle-review" ? `ruling: ${rulingKeys.map((key) => DB_HANDLE_RULINGS.get(key)).find((found) => found !== undefined) ?? "unruled"}` : "";
  return [describeForeignTypes(foreign), ruling].filter((part) => part !== "").join("; ");
}
