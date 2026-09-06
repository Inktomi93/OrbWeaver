// Builds the capability-bounded policy context and owns anchored finding/receipt collection.
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Node, SourceFile, TypeChecker } from "ts-morph";
import { ts } from "ts-morph";
import type { GateFact, GateFactContext, GateFactValue } from "../contract/fact.ts";
import type { RawGateFinding } from "../contract/gate-authority.ts";
import type {
  GatePolicy,
  GatePolicyContext,
  GatePolicyFileFindingDetails,
  GatePolicyFindingDetails,
  GatePolicyNodeFindingDetails,
} from "../contract/policy.ts";
import type { PolicySemanticReceipt } from "../contract/policy-pass.ts";
import type { GatePolicyReceipt } from "../contract/policy-primitives.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import { assertRepoPathIdentity } from "./policy-validation.ts";
import { resourceRequestIdentity } from "./resource-declaration.ts";
import { bindPolicyResources } from "./resource-policy.ts";

const COMMON_DETAIL_KEYS = ["message", "fix", "subject", "operation"] as const;
const NODE_DETAIL_KEYS = new Set([...COMMON_DETAIL_KEYS, "token", "offset"]);
const FILE_DETAIL_KEYS = new Set([...COMMON_DETAIL_KEYS, "line", "column", "token"]);
const POPULATION_RECEIPT_KEYS = new Set(["kind", "source", "members", "unresolved"]);
const RESOURCE_RECEIPT_KEYS = new Set(["kind", "source", "resources", "unresolved"]);

interface ContextInput {
  readonly policy: GatePolicy;
  readonly root: string;
  readonly files: readonly SourceFile[];
  readonly resourcePaths: readonly string[];
  readonly resources: ResourceHost;
  readonly resourceRequests: readonly GateResourceRequest[];
  readonly checker: () => TypeChecker;
  readonly findings: RawGateFinding[];
  readonly factValues: PolicyFactValueRegistry;
}

export type PolicyFactValueEntry =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly value: unknown }
  | { readonly status: "failed"; readonly message: string };

export type PolicyFactValueRegistry = Map<GateFact, PolicyFactValueEntry>;

export interface PolicyContextRuntime {
  readonly context: GatePolicyContext;
  readonly finishReceipts: () => readonly PolicySemanticReceipt[];
  readonly unconsumedFacts: () => readonly string[];
  readonly unconsumedResources: () => readonly string[];
  readonly unconsumedResourceRequests: () => readonly string[];
}

interface CapabilityContextInput {
  readonly ownerId: string;
  readonly analysis: GatePolicy["analysis"];
  readonly root: string;
  readonly files: readonly SourceFile[];
  readonly resourcePaths: readonly string[];
  readonly resources: ResourceHost;
  readonly resourceRequests: readonly GateResourceRequest[];
  readonly checker: () => TypeChecker;
}

export interface FactContextRuntime extends Omit<PolicyContextRuntime, "context" | "unconsumedFacts"> {
  readonly context: GateFactContext;
}

function exactKeys(value: object, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new Error(`${label} cannot author ${JSON.stringify(unknown)}`);
  }
}

function assertOptionalText(value: unknown, label: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(`${label} must be a nonempty string when present`);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function findingDetails(details: GatePolicyFindingDetails | undefined): GatePolicyFindingDetails {
  const safe = details ?? {};
  for (const key of COMMON_DETAIL_KEYS) {
    assertOptionalText(safe[key], `finding ${key}`);
  }
  return safe;
}

function appendDetails(base: { file: string; line: number; column: number }, details: GatePolicyFindingDetails & { readonly token?: string }): RawGateFinding {
  return {
    ...base,
    ...(details.token === undefined ? {} : { token: details.token }),
    ...(details.message === undefined ? {} : { message: details.message }),
    ...(details.fix === undefined ? {} : { fix: details.fix }),
    ...(details.subject === undefined ? {} : { subject: details.subject }),
    ...(details.operation === undefined ? {} : { operation: details.operation }),
  };
}

function derivedNodePosition(node: Node): { readonly offset: number; readonly token: string } {
  const text = node.getText();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text);
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const token = scanner.getTokenText();
    const identityKind =
      kind === ts.SyntaxKind.Identifier ||
      kind === ts.SyntaxKind.PrivateIdentifier ||
      (kind >= ts.SyntaxKind.FirstLiteralToken && kind <= ts.SyntaxKind.LastLiteralToken) ||
      (kind >= ts.SyntaxKind.FirstKeyword && kind <= ts.SyntaxKind.LastKeyword);
    if (identityKind && !/[()\r\n]/u.test(token)) {
      return { offset: scanner.getTokenStart(), token };
    }
  }
  throw new Error(`node finding cannot derive a nonempty authored position token from ${node.getKindName()}`);
}

function repoRelative(root: string, sourceFile: SourceFile): string {
  const rel = relative(resolve(root), resolve(sourceFile.getFilePath()));
  const normalized = sep === "/" ? rel : rel.split(sep).join("/");
  if (normalized.length === 0 || isAbsolute(rel) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`source file is outside the policy root: ${sourceFile.getFilePath()}`);
  }
  assertRepoPathIdentity(normalized, "source file path");
  return normalized;
}

function assertCoordinate(value: number | undefined, label: string): number {
  const coordinate = value ?? 1;
  if (!(Number.isInteger(coordinate) && coordinate >= 1)) {
    throw new Error(`${label} must be a positive integer`);
  }
  return coordinate;
}

function assertCount(value: unknown, label: string): number {
  if (!(Number.isInteger(value) && (value as number) >= 0)) {
    throw new Error(`${label} must be a nonnegative integer`);
  }
  return value as number;
}

function receiptRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("policy receipt must be an object with an exact discriminant");
  }
  return value as Record<string, unknown>;
}

function acceptPopulationReceipt(receipts: Map<string, PolicySemanticReceipt>, receipt: Record<string, unknown>): void {
  exactKeys(receipt, POPULATION_RECEIPT_KEYS, "policy receipt");
  const source = requiredText(receipt["source"], "policy receipt source");
  const members = assertCount(receipt["members"], "policy receipt members");
  const unresolved = assertCount(receipt["unresolved"] ?? 0, "policy receipt unresolved");
  const key = JSON.stringify(["population", source]);
  const prior = receipts.get(key);
  receipts.set(key, {
    kind: "population",
    source,
    members: (prior?.kind === "population" ? prior.members : 0) + members,
    unresolved: (prior?.unresolved ?? 0) + unresolved,
  });
}

function acceptResourceReceipt(receipts: Map<string, PolicySemanticReceipt>, receipt: Record<string, unknown>): void {
  exactKeys(receipt, RESOURCE_RECEIPT_KEYS, "policy receipt");
  const source = requiredText(receipt["source"], "policy receipt source");
  const resources = assertCount(receipt["resources"], "policy receipt resources");
  const unresolved = assertCount(receipt["unresolved"] ?? 0, "policy receipt unresolved");
  const key = JSON.stringify(["resource", source]);
  const prior = receipts.get(key);
  receipts.set(key, {
    kind: "resource",
    source,
    resources: (prior?.kind === "resource" ? prior.resources : 0) + resources,
    unresolved: (prior?.unresolved ?? 0) + unresolved,
  });
}

function acceptReceipt(receipts: Map<string, PolicySemanticReceipt>, value: unknown): void {
  const receipt = receiptRecord(value);
  if (receipt["kind"] === "population") {
    acceptPopulationReceipt(receipts, receipt);
    return;
  }
  if (receipt["kind"] === "resource") {
    acceptResourceReceipt(receipts, receipt);
    return;
  }
  throw new Error(`policy receipt has invalid discriminant ${JSON.stringify(receipt["kind"])}`);
}

function makeCapabilityContext(input: CapabilityContextInput): FactContextRuntime {
  const files = Object.freeze([...input.files]);
  const resourcePaths = Object.freeze([...input.resourcePaths]);
  const paths = new Map(files.map((candidate) => [repoRelative(input.root, candidate), candidate]));
  const sourceIdentities = new Set(files.map((candidate) => candidate.compilerNode));
  const receipts = new Map<string, PolicySemanticReceipt>();
  const consumedResources = new Set<string>();
  const consumedResourceRequests = new Set<string>();

  const relativePath = (candidate: SourceFile): string => {
    if (!sourceIdentities.has(candidate.compilerNode)) {
      throw new Error(`source file is outside the effective population: ${candidate.getFilePath()}`);
    }
    return repoRelative(input.root, candidate);
  };
  const sourceFile = (path: string): SourceFile => {
    assertRepoPathIdentity(path, "sourceFile path");
    const found = paths.get(path);
    if (found === undefined) {
      throw new Error(`sourceFile path is absent or outside the effective population: ${path}`);
    }
    return found;
  };
  const receipt = (value: GatePolicyReceipt): void => acceptReceipt(receipts, value);
  const context: GateFactContext = Object.freeze({
    files,
    resourcePaths,
    resources: bindPolicyResources({
      host: input.resources,
      context: { resourcePaths, receipt },
      declarations: input.resourceRequests,
      onConsumed: (requestIdentity, acquiredPaths) => {
        consumedResourceRequests.add(requestIdentity);
        for (const path of acquiredPaths) {
          consumedResources.add(path);
        }
      },
    }),
    relativePath,
    sourceFile,
    checker: () => {
      if (input.analysis === "syntax") {
        throw new Error(`syntax owner ${input.ownerId} cannot access the type checker`);
      }
      return input.checker();
    },
    receipt,
  });
  return {
    context,
    unconsumedResources: () => resourcePaths.filter((path) => !consumedResources.has(path)),
    unconsumedResourceRequests: () => input.resourceRequests.map(resourceRequestIdentity).filter((identity) => !consumedResourceRequests.has(identity)),
    finishReceipts: () => [...receipts.values()].toSorted((left, right) => left.kind.localeCompare(right.kind) || left.source.localeCompare(right.source)),
  };
}

export function makeFactContext(input: CapabilityContextInput): FactContextRuntime {
  return makeCapabilityContext(input);
}

/** Construct one invocation-local policy context. No internal Project/root reference is exposed on it. */
export function makePolicyContext(input: ContextInput): PolicyContextRuntime {
  const capability = makeCapabilityContext({
    ownerId: input.policy.id,
    analysis: input.policy.analysis,
    root: input.root,
    files: input.files,
    resourcePaths: input.resourcePaths,
    resources: input.resources,
    resourceRequests: input.resourceRequests,
    checker: input.checker,
  });
  const effectivePaths = new Set([...capability.context.files.map(capability.context.relativePath), ...capability.context.resourcePaths]);
  const consumedFacts = new Set<GateFact>();
  const reportNode = (node: Node, rawDetails?: GatePolicyNodeFindingDetails): void => {
    const details = rawDetails ?? {};
    exactKeys(details, NODE_DETAIL_KEYS, "node finding");
    const common = findingDetails(details);
    const path = capability.context.relativePath(node.getSourceFile());
    let position = node.getStart();
    const runtime = details as GatePolicyFindingDetails & { readonly token?: unknown; readonly offset?: unknown };
    const token = runtime.token;
    const offset = runtime.offset;
    if ((token === undefined) !== (offset === undefined)) {
      throw new Error("node finding token and offset must be supplied together");
    }
    let anchoredToken: string;
    if (token !== undefined && offset !== undefined) {
      anchoredToken = requiredText(token, "node finding token");
      const text = node.getText();
      if (
        !(
          Number.isInteger(offset) &&
          (offset as number) >= 0 &&
          (offset as number) + anchoredToken.length <= text.length &&
          text.slice(offset as number, (offset as number) + anchoredToken.length) === anchoredToken
        )
      ) {
        throw new Error(`node finding token ${JSON.stringify(anchoredToken)} is not anchored at its declared offset`);
      }
      position += offset as number;
    } else {
      const derived = derivedNodePosition(node);
      anchoredToken = derived.token;
      position += derived.offset;
    }
    const { line, column } = node.getSourceFile().getLineAndColumnAtPos(position);
    input.findings.push(appendDetails({ file: path, line, column }, { ...common, token: anchoredToken }));
  };
  const reportFile = (path: string, rawDetails?: GatePolicyFileFindingDetails): void => {
    assertRepoPathIdentity(path, "finding file");
    if (!effectivePaths.has(path)) {
      throw new Error(`finding file is outside the effective population: ${path}`);
    }
    const details = rawDetails ?? {};
    exactKeys(details, FILE_DETAIL_KEYS, "file finding");
    findingDetails(details);
    assertOptionalText(details.token, "finding token");
    input.findings.push(
      appendDetails({ file: path, line: assertCoordinate(details.line, "finding line"), column: assertCoordinate(details.column, "finding column") }, details),
    );
  };
  const fact = <Fact extends GateFact>(provider: Fact): GateFactValue<Fact> => {
    if (!input.policy.facts.includes(provider)) {
      throw new Error(`policy ${input.policy.id} requested undeclared fact ${provider.id}`);
    }
    const value = input.factValues.get(provider);
    if (value === undefined) {
      throw new Error(`declared fact is absent from this pass: ${provider.id}`);
    }
    if (value.status === "pending") {
      throw new Error(`declared fact is not finished: ${provider.id}`);
    }
    if (value.status === "failed") {
      throw new Error(`declared fact failed: ${provider.id}: ${value.message}`);
    }
    consumedFacts.add(provider);
    return value.value as GateFactValue<Fact>;
  };
  const context: GatePolicyContext = Object.freeze({
    ...capability.context,
    fact,
    report: Object.freeze({ node: reportNode, file: reportFile }),
  });
  return {
    ...capability,
    context,
    unconsumedFacts: () => input.policy.facts.filter((provider) => !consumedFacts.has(provider)).map(({ id }) => id),
  };
}
