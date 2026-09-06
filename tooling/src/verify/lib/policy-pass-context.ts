// Builds the capability-bounded policy context and owns anchored finding/receipt collection.
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Node, SourceFile, TypeChecker } from "ts-morph";
import { ts } from "ts-morph";
import type { RawGateFinding } from "../contract/gate-authority.ts";
import type {
  GatePolicy,
  GatePolicyContext,
  GatePolicyFileFindingDetails,
  GatePolicyFindingDetails,
  GatePolicyNodeFindingDetails,
  GatePolicyReceipt,
  GateSharedFactLease,
} from "../contract/policy.ts";
import type { PolicySemanticReceipt } from "../contract/policy-pass.ts";
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
  readonly sharedFacts: PolicySharedFactRegistry;
}

export interface PolicySharedFactEntry {
  readonly sourcePaths: readonly string[];
  readonly resourcePaths: readonly string[];
  readonly value: unknown;
}

export type PolicySharedFactRegistry = Map<object, PolicySharedFactEntry>;

export interface PolicyContextRuntime {
  readonly context: GatePolicyContext;
  readonly finishReceipts: () => readonly PolicySemanticReceipt[];
  readonly unconsumedResources: () => readonly string[];
  readonly unconsumedResourceRequests: () => readonly string[];
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

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((path, index) => path === right[index]);
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
      return { offset: scanner.getTokenPos(), token };
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

/** Construct one invocation-local context. No internal Project/root reference is exposed on it. */
export function makePolicyContext(input: ContextInput): PolicyContextRuntime {
  const files = Object.freeze([...input.files]);
  const resourcePaths = Object.freeze([...input.resourcePaths]);
  const paths = new Map(files.map((candidate) => [repoRelative(input.root, candidate), candidate]));
  const sourceIdentities = new Set(files.map((candidate) => candidate.compilerNode));
  const effectivePaths = new Set([...paths.keys(), ...resourcePaths]);
  const receipts = new Map<string, PolicySemanticReceipt>();
  const consumedResources = new Set<string>();
  const consumedResourceRequests = new Set<string>();

  const relativePath = (candidate: SourceFile): string => {
    if (!sourceIdentities.has(candidate.compilerNode)) {
      throw new Error(`source file is outside the effective population: ${candidate.getFilePath()}`);
    }
    return repoRelative(input.root, candidate);
  };
  const getSourceFile = (path: string): SourceFile => {
    assertRepoPathIdentity(path, "sourceFile path");
    const found = paths.get(path);
    if (found === undefined) {
      throw new Error(`sourceFile path is absent or outside the effective population: ${path}`);
    }
    return found;
  };
  const reportNode = (node: Node, rawDetails?: GatePolicyNodeFindingDetails): void => {
    const details = rawDetails ?? {};
    exactKeys(details, NODE_DETAIL_KEYS, "node finding");
    const common = findingDetails(details);
    const path = relativePath(node.getSourceFile());
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
  const report = Object.freeze({ node: reportNode, file: reportFile });
  const receipt = (value: GatePolicyReceipt): void => acceptReceipt(receipts, value);
  const sourcePaths = [...paths.keys()];
  const sharedFact = <Value>(key: object, create: () => Value): GateSharedFactLease<Value> => {
    const existing = input.sharedFacts.get(key);
    if (existing !== undefined) {
      if (!(samePaths(existing.sourcePaths, sourcePaths) && samePaths(existing.resourcePaths, resourcePaths))) {
        throw new Error("shared fact consumers must have identical effective source and resource populations");
      }
      return Object.freeze({ value: existing.value as Value, collect: false });
    }
    const value = create();
    input.sharedFacts.set(key, { sourcePaths, resourcePaths, value });
    return Object.freeze({ value, collect: true });
  };
  const context: GatePolicyContext = Object.freeze({
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
    sourceFile: getSourceFile,
    checker: () => {
      if (input.policy.analysis === "syntax") {
        throw new Error(`syntax policy ${input.policy.id} cannot access the type checker`);
      }
      return input.checker();
    },
    sharedFact,
    report,
    receipt,
  });
  return {
    context,
    unconsumedResources: () => resourcePaths.filter((path) => !consumedResources.has(path)),
    unconsumedResourceRequests: () => input.resourceRequests.map(resourceRequestIdentity).filter((identity) => !consumedResourceRequests.has(identity)),
    finishReceipts: () => [...receipts.values()].toSorted((left, right) => left.kind.localeCompare(right.kind) || left.source.localeCompare(right.source)),
  };
}
