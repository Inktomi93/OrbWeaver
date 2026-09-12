// Builds the capability-bounded policy context and owns anchored finding/receipt collection.
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
import type { PolicyFactValueRegistry, PolicySemanticReceipt } from "../contract/policy-pass.ts";
import type { GatePolicyReceipt } from "../contract/policy-primitives.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import { declarationHome } from "./declaration-home.ts";
import { isWaivablePosition } from "./ordinary-waiver.ts";
import { assertRepoPathIdentity } from "./policy-validation.ts";
import { populationIncludes } from "./population-resolver.ts";
import { resourceRequestIdentity } from "./resource-declaration.ts";
import { bindPolicyResources } from "./resource-policy.ts";

const COMMON_DETAIL_KEYS = ["message", "fix", "subject", "operation"] as const;
const NODE_DETAIL_KEYS = new Set([...COMMON_DETAIL_KEYS, "token", "offset"]);
const FILE_DETAIL_KEYS = new Set([...COMMON_DETAIL_KEYS, "line", "column", "token"]);
const POPULATION_RECEIPT_KEYS = new Set(["kind", "source", "members", "unresolved"]);
const RESOURCE_RECEIPT_KEYS = new Set(["kind", "source", "resources", "unresolved"]);

interface ContextInput {
  readonly policy: GatePolicy;
  /** Repo-relative POSIX path per workspace SourceFile (keyed by its compiler node), resolved ONCE by the pass. */
  readonly paths: ReadonlyMap<object, string>;
  readonly files: readonly SourceFile[];
  readonly resourcePaths: readonly string[];
  readonly resources: ResourceHost;
  readonly resourceRequests: readonly GateResourceRequest[];
  readonly checker: () => TypeChecker;
  readonly findings: RawGateFinding[];
  readonly factValues: PolicyFactValueRegistry;
}

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
  readonly paths: ReadonlyMap<object, string>;
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

/** THE UNWAIVABLE-POSITION FENCE (#1957, armed on the #2107 ruling).
 *
 *  A finding's position token is the only handle an `@orb-waive` marker has on it, and the marker grammar's
 *  position group cannot hold a paren, a CR or an LF ({@link isWaivablePosition}, the ONE home of that rule).
 *  A finding minted with such a token is REAL and permanently UNANSWERABLE: every marker naming it parses
 *  `malformed`, so the policy's own `fix` string — "write an adjacent `@orb-waive <id>(<position>)`" —
 *  instructs the reader to do something the parser refuses.
 *
 *  The DERIVED path below always obeyed the rule: `derivedNodePosition` skips any candidate carrying one. The
 *  EXPLICIT `{ token, offset }` path and `report.file`'s `token` did not, and that asymmetry WAS the class.
 *
 *  THE ORDER MATTERED AND IS RECORDED. The fence was built, armed once against the live corpus, and held back
 *  because that run WAS the finding: it named five rows in three policies minting positions the grammar
 *  cannot hold (`no-raw-color-in-css` mustFlag[1] `oklch(0.5 0.2 30)`, ORDINARY · `no-tailwind-dark-variant`
 *  mustFlag[13]/[14], ORDINARY · `rest-transform-grid` mustFlag[4]/[6], hard and therefore latent). Owner
 *  ruling #2107 (2026-09-12) took neither "narrow the anchor" nor "widen the grammar" but the arm the law
 *  already described (guide §3): the value stays the CARRIER and moves into the MESSAGE, while the COORDINATE
 *  narrows to its leading paren-free slice through `waivableCoordinate`. Those three landed FIRST, in this
 *  commit, so the fence goes up on a tree where nothing correct reds.
 *
 *  It is a THROW rather than a silent drop because a policy that cannot express its own position has a defect
 *  in its ANCHORING, not in its subject, and `lib/caught-failure.ts` is the worked answer (`anchorWithin` /
 *  `calleeAnchorCandidates` / `firstAnchor` / `catchAnchor` take the widest candidate the grammar can hold and
 *  fall back to the member NAME when a chain spans lines). A policy needing an exact-slice position CONSUMES
 *  that; it never re-derives one. The fence binds regardless of AUTHORITY: a hard policy's findings are
 *  unwaivable anyway, but authority is a field an owner can change, and a position minted under `hard` would
 *  become silently unanswerable the day it flips — which is exactly why `rest-transform-grid` was repaired
 *  alongside the two ordinary ones instead of being left as a declared limit. */
function assertWaivablePosition(token: string, label: string): string {
  if (!isWaivablePosition(token)) {
    throw new Error(
      `${label} ${JSON.stringify(token)} cannot be named by an @orb-waive marker: the position grammar admits no parenthesis, CR or LF, ` +
        "so the finding would be permanently unwaivable. Keep the value as the CARRIER and in the MESSAGE, and hand back its leading " +
        "paren-free slice as the COORDINATE (lib/ordinary-waiver.ts waivableCoordinate; guide §3, #2107).",
    );
  }
  return token;
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
    if (identityKind && isWaivablePosition(token)) {
      return { offset: scanner.getTokenStart(), token };
    }
  }
  throw new Error(`node finding cannot derive a nonempty authored position token from ${node.getKindName()}`);
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
  // Per-owner path tables are LOOKUPS into the pass's one resolution: `relativePath` runs on every visited
  // node (56 policy call sites + every `report.node`), and re-deriving `relative(resolve(root), …)` plus the
  // identity asserts there was ~7 s of a 46 s composed pass (node:path 5.3 s + the asserts, profiled 2026-09-06).
  const pathByIdentity = new Map<object, string>(
    files.map((candidate) => {
      const path = input.paths.get(candidate.compilerNode);
      if (path === undefined) {
        throw new Error(`source file is outside the policy root: ${candidate.getFilePath()}`);
      }
      return [candidate.compilerNode, path];
    }),
  );
  const paths = new Map(files.map((candidate) => [pathByIdentity.get(candidate.compilerNode) as string, candidate]));
  const receipts = new Map<string, PolicySemanticReceipt>();
  const consumedResources = new Set<string>();
  const consumedResourceRequests = new Set<string>();

  const relativePath = (candidate: SourceFile): string => {
    const path = pathByIdentity.get(candidate.compilerNode);
    if (path === undefined) {
      throw new Error(`source file is outside the effective population: ${candidate.getFilePath()}`);
    }
    return path;
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

/** WHY A REFUSED FILE IS REFUSED, when the answer is the policy's OWN declared provider (#1976).
 *
 *  A shared fact's population is the UNION of its consumers' by construction — `tuple-vocabulary-fact.ts`
 *  declares `@client`+`@server`+`@contracts` and is read by four policies each strictly narrower — so the
 *  value a policy receives routinely carries nodes from files the policy may not NAME. Ask `ctx.relativePath`
 *  about one and the pass THROWS and withholds the whole policy: correct (a finding outside the population
 *  would be unanchorable), fail-closed, and completely silent about the cause. Three independent workarounds
 *  for it already exist on the tree — `chrome-registry-completeness.ts:87` and `warning-code-coverage.ts:176`
 *  route through `lib/declaration-home.ts`, and `lib/role-vocabulary.ts` `vocabularyAtHome` hand-rolls an
 *  absolute-path infix for the same reason — which is the evidence the class is real and was unnamed.
 *
 *  So the refusal now DIAGNOSES rather than merely refusing. The message KEEPS its measured prefix (the
 *  before/after pair in `warning-code-coverage.ts:167-170` quotes it) and appends the fact that admits the
 *  file plus the reader that answers it. A containment REQUIREMENT in the other direction was considered and
 *  refused: `fact.population ⊆ policy.population` is false for all four live consumers and would make a
 *  shared primitive index unshareable. */
function factWideningDiagnosis(policy: GatePolicy): (repoRelativePath: string) => string {
  const providers = policy.facts;
  return (repoRelativePath) => {
    if (providers.length === 0 || repoRelativePath.startsWith("/") || repoRelativePath.includes("\\")) {
      return "";
    }
    const admitting = providers.filter((provider) => populationIncludes(provider.population, repoRelativePath)).map(({ id }) => id);
    return admitting.length === 0
      ? ""
      : `; it IS inside the population of this policy's declared fact ${admitting.join(", ")}, which is wider than the policy's own. ` +
          "A declaration reached through a shared provider is named with `declarationHome(ctx, file)` (lib/declaration-home.ts), never with ctx.relativePath.";
  };
}

/** Construct one invocation-local policy context. No internal Project/root reference is exposed on it. */
export function makePolicyContext(input: ContextInput): PolicyContextRuntime {
  const capability = makeCapabilityContext({
    ownerId: input.policy.id,
    analysis: input.policy.analysis,
    paths: input.paths,
    files: input.files,
    resourcePaths: input.resourcePaths,
    resources: input.resources,
    resourceRequests: input.resourceRequests,
    checker: input.checker,
  });
  const deliveredPaths = new Set(capability.context.files.map(capability.context.relativePath));
  const effectivePaths = new Set([...deliveredPaths, ...capability.context.resourcePaths]);
  const consumedFacts = new Set<GateFact>();
  const factWidening = factWideningDiagnosis(input.policy);
  const relativePath = (candidate: SourceFile): string => {
    const home = declarationHome(capability.context, candidate);
    if (!deliveredPaths.has(home)) {
      throw new Error(`source file is outside the effective population: ${candidate.getFilePath()}${factWidening(home)}`);
    }
    return capability.context.relativePath(candidate);
  };
  const sourceFile = (path: string): SourceFile => {
    assertRepoPathIdentity(path, "sourceFile path");
    if (!deliveredPaths.has(path)) {
      throw new Error(`sourceFile path is absent or outside the effective population: ${path}${factWidening(path)}`);
    }
    return capability.context.sourceFile(path);
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
      anchoredToken = assertWaivablePosition(requiredText(token, "node finding token"), "node finding token");
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
      throw new Error(`finding file is outside the effective population: ${path}${factWidening(path)}`);
    }
    const details = rawDetails ?? {};
    exactKeys(details, FILE_DETAIL_KEYS, "file finding");
    findingDetails(details);
    assertOptionalText(details.token, "finding token");
    if (details.token !== undefined) {
      assertWaivablePosition(details.token, "finding token");
    }
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
    relativePath,
    sourceFile,
    fact,
    report: Object.freeze({ node: reportNode, file: reportFile }),
  });
  return {
    ...capability,
    context,
    unconsumedFacts: () => input.policy.facts.filter((provider) => !consumedFacts.has(provider)).map(({ id }) => id),
  };
}
