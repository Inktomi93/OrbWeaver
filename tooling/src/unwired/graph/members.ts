// `pnpm unwired scan`, the member scan: the graph's member rows (./judge.ts) whose member is callable, in the member
// scan's words. A callable is a method, or a property or accessor whose non-nullable type has a call signature, of any
// member home the graph judges: an interface, a type literal, a class or a nested literal.
//
// - A row is test-only when production never reads it and a test, the testkit, tooling or a script reads or calls it. A
//   site outside the product that only writes it, such as a test fake implementing a port, makes no row test-only: the
//   member stays reported by what the product does to it.
// - A row's other kind is its member bucket's name in the member scan's words; a sent-only member's sends name where its
//   value went.
import type { Node } from "@typescript/native/ast";
import {
  isGetAccessorDeclaration,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator } from "@typescript/native/sync";
import { SignatureKind } from "@typescript/native/sync";
import type { NativeWorld } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { MemberBucket } from "./analyse.ts";
import { declaredNameOf } from "./declared.ts";
import type { JudgedMembers, MemberRow } from "./judge.ts";
import { declaredMembers } from "./judge.ts";
import type { DeclKey } from "./resolve.ts";
import { READS } from "./roles.ts";
import type { GraphFacts } from "./state.ts";
import { productReader } from "./state.ts";

const MEMBER_KINDS = ["builder-only", "sent-only", "never-supplied", "test-only", "unreferenced"] as const;
/** `builder-only`: production supplies it and never calls it. `sent-only`: production hands its value out of the process
 *  and never calls it. `never-supplied`: production calls it and nothing supplies it, so every call sees its default.
 *  `test-only`: production never calls it and code outside the product reads it. `unreferenced`: production neither
 *  calls nor supplies it. */
type MemberKind = (typeof MEMBER_KINDS)[number];

const KIND_OF: Readonly<Record<MemberBucket, MemberKind>> = {
  "member-write-only": "builder-only",
  "member-sent-only": "sent-only",
  "member-untouched": "unreferenced",
  "member-read-only": "never-supplied",
  "member-validated": "unreferenced",
};

// The bucket whose member production reads: a read outside the product adds nothing to it.
const READ_BY_PRODUCT: MemberBucket = "member-read-only";

/** A member row in the member scan's words; `tests` counts the reads outside the product. */
type ScanRow = Omit<MemberRow, "tests"> & { readonly kind: MemberKind; readonly tests: number };

export interface MemberScanReport {
  /** The callable members the product declares. */
  readonly scanned: number;
  readonly unwired: readonly ScanRow[];
  readonly deliberate: readonly (ScanRow & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: readonly (ScanRow & Pick<JudgedMembers["judged"][number], "item" | "tie">)[];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedMembers["staleJudged"];
  /** Schema keys production neither writes nor reads: only a parse of input from outside the tree fills them. */
  readonly validated: readonly ScanRow[];
  /** Never-called members of a tRPC mutation's one-member output: the acknowledgement is the procedure's whole answer. */
  readonly acknowledged: readonly ScanRow[];
  readonly received: JudgedMembers["received"];
  readonly limits: readonly string[];
}

/** What the member scan cannot see or does not fill, printed with every run. */
const MEMBER_LIMITS: readonly string[] = [
  "Every row is a graph member row (tooling/src/unwired/graph/judge.ts), so the graph's own limits hold: docs/plans/unwired-code/design.md 'Member rows on the graph against the fields scan'.",
  "A member is callable by its declared type alone: a property typed by a union with a function arm is callable, and a property typed `unknown` that holds a function is not.",
  "A call from outside the tree, such as a plugin guest's or an external agent's, is invisible; a published SDK member is received, and any other needs a deliberate entry.",
  "No second engine audits a row: the scan has no --cross-check and no disagreements list.",
];

const isCallableKind = (node: Node): boolean => isMethodSignatureDeclaration(node) || isMethodDeclaration(node);
const isTypedHolder = (node: Node): boolean => isPropertySignatureDeclaration(node) || isPropertyDeclaration(node) || isGetAccessorDeclaration(node);

// Whether each declaration is callable: a method by its kind, a property or getter by whether its non-nullable type
// has a call signature. A schema key, an enum member or a setter holds no callable.
function callables(world: NativeWorld, decls: readonly DeclKey[]): readonly boolean[] {
  const { checker } = world;
  return world.batch(
    decls.map(function* (decl): APIRequestGenerator<boolean> {
      const declaration = declaredNameOf(world, decl)?.parent;
      if (declaration === undefined || !(isCallableKind(declaration) || isTypedHolder(declaration))) {
        return false;
      }
      if (isCallableKind(declaration)) {
        return true;
      }
      const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(declaration));
      return (yield* checker.getSignaturesOfType.gen(type, SignatureKind.Call)).length > 0;
    }),
  );
}

/** The member scan of a graph session's judged member rows: the rows of callable members, each with its scan kind. */
export function memberScanOf(world: NativeWorld, facts: GraphFacts, members: JudgedMembers): MemberScanReport {
  const declared = declaredMembers(facts).filter(({ file }) => isProduction(file));
  const callable = callables(
    world,
    declared.map(({ decl }) => decl),
  );
  const decls = new Map(declared.flatMap(({ decl, key }, at) => (callable[at] === true ? [[key, decl] as const] : [])));
  const outsideReads = (decl: DeclKey): number => (facts.roleSites.get(decl) ?? []).filter(({ file, role }) => !productReader(file) && READS.has(role)).length;
  const scanned = <Row extends MemberRow>(rows: readonly Row[]): (Omit<Row, "tests"> & { readonly kind: MemberKind; readonly tests: number })[] =>
    rows.flatMap((row) => {
      const decl = decls.get(row.key);
      if (decl === undefined) {
        return [];
      }
      const tests = outsideReads(decl);
      return [{ ...row, tests, kind: tests > 0 && row.bucket !== READ_BY_PRODUCT ? "test-only" : KIND_OF[row.bucket] }];
    });
  return {
    scanned: decls.size,
    unwired: scanned(members.unwired),
    deliberate: scanned(members.deliberate),
    judged: scanned(members.judged),
    staleJudged: members.staleJudged,
    validated: scanned(members.validated),
    acknowledged: scanned(members.acknowledged),
    received: members.received.filter(({ key }) => decls.has(key)),
    limits: MEMBER_LIMITS,
  };
}
