// @subject tooling/src/verify/lib/caught-failure-native.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind, ts } from "ts-morph";
import type { BoundedRead } from "../../../../tooling/src/floor/code-facts/bounded-closure.ts";
import { walkBoundedClosure, withinClosureBound } from "../../../../tooling/src/floor/code-facts/bounded-closure.ts";
import type { NativeInvocationEvidence } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import type { TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import type { CaughtFailureReadServices } from "../../../../tooling/src/verify/contract/caught-failure.ts";
import { catchClauseSite, caughtFailureReviewSites, caughtFailureSite } from "../../../../tooling/src/verify/lib/caught-failure.ts";
import { nativeFailureRead } from "../../../../tooling/src/verify/lib/caught-failure-native.ts";
import {
  CAUGHT_FAILURE_CLOSURE_HOPS,
  FAILURE_OUTCOME_DISCRIMINANTS,
  FAILURE_OUTCOME_OK_MEMBER,
  PROMISE_LIKE_MEMBER,
} from "../../../../tooling/src/verify/lib/caught-failure-read.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const OUTCOME_MEMBERS: readonly string[] = [FAILURE_OUTCOME_OK_MEMBER, ...FAILURE_OUTCOME_DISCRIMINANTS];

// Owned and unowned catches and rejection handlers whose verdicts hang on the planned member reads.
const SITES = `
declare function work(): void;
declare function refuse(): { kind: "refused"; reason: string };
declare function settle(): { ok: true; value: number };
declare function deny(): { status: "denied" } | { status: "refused" };
declare function record(...values: readonly unknown[]): void;
declare const fake: { catch(handler: () => void): void };
export function refused() { try { work(); } catch { return refuse(); } }
export function settled() { try { work(); } catch { return settle(); } }
export function denied() { try { work(); } catch { return deny(); } }
export function absorbed(p: Promise<void> | undefined) { void p?.catch(() => undefined); }
export function lookalike() { fake.catch(() => undefined); }
`;

// `count` union-typed values read inside one catch: no new calls, only member-shaped non-call nodes.
function fillers(count: number): string {
  const names = Array.from({ length: count }, (_, index) => `filler${String(index)}`);
  const declarations = names.map((name) => `declare const ${name}: { ok: boolean; status: "ready" | "failed"; step: { kind: "a" | "b" } } | undefined;`);
  const reads = names.flatMap((name) => [name, `${name}?.status`, `${name}?.step.kind`]).join(", ");
  return `${declarations.join("\n")}\nexport function filled() { try { work(); } catch { record(${reads}); } }`;
}

interface PlannedRead {
  readonly source: SourceFile;
  readonly selectors: readonly NativeTypeSelector[];
  readonly reads: CaughtFailureReadServices;
}

function plannedRead(count: number, text = `${SITES}\n${fillers(count)}`): PlannedRead {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 } });
  const source = project.createSourceFile("/packages/server/src/probe.ts", text);
  const facts = isolatedTypeFacts(project);
  const owner = "caught-failure-type-plan";
  const evidence: NativeInvocationEvidence[] = [];
  const native = nativeFailureRead(
    {
      files: [source],
      nativeTypes: {
        request: (query) => facts.request(owner, query),
        invocationEvidence: (nodes, plan) => {
          const answer = facts.invocationEvidence(owner, nodes, plan);
          evidence.push(...answer.values());
          return answer;
        },
        references: (nodes, importer) => facts.references(owner, nodes, importer),
      },
    },
    () => [...source.getDescendantsOfKind(SyntaxKind.CatchClause), ...source.getDescendantsOfKind(SyntaxKind.CallExpression)],
  );
  native.prepare();
  facts.seal(new Set([owner]));
  const reads = native.at(source);
  const selectors = evidence.flatMap((value) => value.typeObservations?.selections?.plan.selectors ?? []);
  return { source, selectors, reads };
}

function memberName(selector: NativeTypeSelector): string | undefined {
  const step = selector.steps.find((value) => value.kind === "property");
  return step?.kind === "property" ? step.name : undefined;
}

function baseNode(selector: NativeTypeSelector): Node {
  if (selector.base.kind === "schema-column") {
    throw new Error("caught-failure plan selected a schema column");
  }
  return selector.base.node;
}

test("outcome member questions grow with the calls a catch returns, not with every member-shaped value node", () => {
  const few = plannedRead(2).selectors.filter((selector) => OUTCOME_MEMBERS.includes(memberName(selector) ?? ""));
  const many = plannedRead(40).selectors.filter((selector) => OUTCOME_MEMBERS.includes(memberName(selector) ?? ""));
  expect(many.length).toBe(few.length);
  // The reader reads an outcome member only on a call's own Type, then that member's union parts.
  for (const selector of many) {
    expect(baseNode(selector).getKind()).toBe(SyntaxKind.CallExpression);
    expect(selector.steps[0]?.kind).toBe("property");
    expect(selector.steps.slice(1).every((step) => step.kind === "union-part")).toBe(true);
  }
  // The promise member is read on a receiver's Type or one of its union parts, never below the member.
  const presence = plannedRead(40).selectors.filter((selector) => memberName(selector) === PROMISE_LIKE_MEMBER);
  expect(presence.length).toBeGreaterThan(0);
  for (const selector of presence) {
    expect(selector.steps.at(-1)).toMatchObject({ kind: "property", name: PROMISE_LIKE_MEMBER });
    expect(selector.steps.slice(0, -1).every((step) => step.kind === "union-part")).toBe(true);
  }
});

test("every member read the verdicts need is still planned, and an unplanned one refuses", () => {
  const { source, reads } = plannedRead(2);
  const verdicts = (value?: CaughtFailureReadServices): readonly string[] =>
    caughtFailureReviewSites(source, value).map((site) => `${site.arm}@${site.node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName() ?? ""}`);
  expect(verdicts(reads)).toEqual(verdicts());
  // The typed refusals own their catch; the success outcome, the discarded rejection and the filler catch do not.
  expect(verdicts(reads).map((verdict) => verdict.split("@")[1])).toEqual(["settled", "absorbed", "filled"]);
  const filler = source.getVariableDeclarationOrThrow("filler0");
  const reference = source
    .getFunctionOrThrow("filled")
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .find((node) => node.getText() === filler.getName());
  if (reference === undefined) {
    throw new Error("filler read is missing");
  }
  expect(() => reads.types.select({ ...nodeTypeSelector(reference), steps: [{ kind: "property", name: FAILURE_OUTCOME_OK_MEMBER, at: reference }] })).toThrow(
    "native Type selector was not captured",
  );
});

test("closure member nominations on a non-closure question refuse instead of planning nothing", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile("/members.ts", "declare const held: Promise<void>;");
  const node = source.getVariableDeclarationOrThrow("held");
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "type-details", nodes: [node], presenceMembers: [PROMISE_LIKE_MEMBER] }],
  };
  expect(() => captureTypeObservations(demand, { anchor: source, admit: () => undefined })).toThrow("native closure member nomination is foreign");
});

// A refusal one factory hop away, and the same refusal one hop past the closure bound: `never` decides both.
const BOUNDED = `
declare function work(): void;
declare function halt(): never;
function near(): unknown { return halt(); }
function hop3(): unknown { return halt(); }
function hop2(): unknown { return hop3(); }
function hop1(): unknown { return hop2(); }
function settle() { return { status: "ok" }; }
export function inside() { try { work(); } catch { return settle(); } }
export function owned() { try { work(); } catch { return near(); } }
export function past() { try { work(); } catch { return hop1(); } }
`;

test("a verdict inside the closure bound still blocks, and one past it is unknown rather than clean", () => {
  expect(CAUGHT_FAILURE_CLOSURE_HOPS).toBe(2);
  const { source, reads } = plannedRead(0, BOUNDED);
  const verdict = (name: string): BoundedRead<string | undefined> =>
    withinClosureBound(() => caughtFailureSite(source.getFunctionOrThrow(name).getFirstDescendantByKindOrThrow(SyntaxKind.CatchClause), reads)?.arm);
  expect(verdict("inside")).toEqual({ kind: "resolved", value: "empty" });
  expect(verdict("owned")).toEqual({ kind: "resolved", value: undefined });
  expect(verdict("past")).toMatchObject({ kind: "unresolved" });
  // The unbounded ts-morph reading owns the same chain, so the bound replaces a clean verdict with an unknown.
  expect(catchClauseSite(source.getFunctionOrThrow("past").getFirstDescendantByKindOrThrow(SyntaxKind.CatchClause))).toBeUndefined();
});

// Every value position the plan no longer types, beside two it still types; `error` is the caught binding.
const POSITIONS = `
declare function work(): void;
declare function note(...values: readonly unknown[]): void;
declare class Box { constructor(value: unknown); }
declare const flag: boolean;
export function positions() {
  try { work(); } catch (error) {
    note(error);
    note((error as Error).message);
    void (flag && error);
    note(\`\${String(flag)}:\${error}\`);
    note([error]);
    void new Box(error);
    note({ error });
    void !error;
    void typeof error;
  }
}
`;

test("a Type question at a value position the plan does not type is past the bound, never a guess", () => {
  const { source, reads } = plannedRead(0, POSITIONS);
  const binding = source.getFirstDescendantByKindOrThrow(SyntaxKind.CatchClause).getVariableDeclarationOrThrow().getNameNode();
  const uses = source.getDescendantsOfKind(SyntaxKind.Identifier).filter((node) => node.getText() === "error" && node !== binding);
  const at = (kind: SyntaxKind): Node => {
    const use = uses.find((node) => node.getParentOrThrow().getKind() === kind);
    if (use === undefined) {
      throw new Error(`no use of the binding under ${SyntaxKind[kind]}`);
    }
    return use;
  };
  const answer = (node: Node): BoundedRead<unknown> => withinClosureBound(() => reads.types.select(nodeTypeSelector(node)));
  expect(answer(at(SyntaxKind.CallExpression))).toMatchObject({ kind: "resolved" });
  expect(answer(at(SyntaxKind.AsExpression))).toMatchObject({ kind: "resolved" });
  for (const kind of [
    SyntaxKind.BinaryExpression,
    SyntaxKind.TemplateSpan,
    SyntaxKind.ArrayLiteralExpression,
    SyntaxKind.NewExpression,
    SyntaxKind.ShorthandPropertyAssignment,
    SyntaxKind.PrefixUnaryExpression,
    SyntaxKind.TypeOfExpression,
  ]) {
    expect(answer(at(kind)), SyntaxKind[kind]).toMatchObject({ kind: "unresolved" });
  }
});

// A multi-statement function reached from a call argument is walked; one reached from a dependency array is not.
const HANDLER_ARRAYS = `
declare function use(...values: readonly unknown[]): unknown;
declare function halt(): never;
function multi(): unknown { const owned = 1; void owned; return halt(); }
export function direct() { return use(multi); }
export function applied() { return use.apply(null, [multi]); }
export function reflected() { return Reflect.apply(use, null, [multi]); }
export function deps() { return use(1, [multi]); }
`;

test("only an apply-style call makes an array element a handler position, never a dependency array", () => {
  const source = new Project({ useInMemoryFileSystem: true }).createSourceFile("/handlers.ts", HANDLER_ARRAYS);
  const declined = (name: string): readonly string[] => {
    const bound: string[] = [];
    walkBoundedClosure(
      { nodes: [source.getFunctionOrThrow(name)], closureHops: CAUGHT_FAILURE_CLOSURE_HOPS, closureHandlerBodiesOnly: true },
      (node) =>
        node.isKind(SyntaxKind.Identifier) &&
        node.getText() === "multi" &&
        node.getParent() !== undefined &&
        !node.getParent()?.isKind(SyntaxKind.FunctionDeclaration)
          ? [source.getFunctionOrThrow("multi")]
          : [],
      { closureBound: (declaration) => void bound.push((declaration as Node).getKindName()), closureWalked: () => undefined },
    );
    return bound;
  };
  expect({ direct: declined("direct"), applied: declined("applied"), reflected: declined("reflected"), deps: declined("deps") }).toEqual({
    direct: [],
    applied: [],
    reflected: [],
    deps: ["FunctionDeclaration"],
  });
});
