// Gate: contract-verb-presence (core/Spine-Testing.md §5) — the INTERFACE-level complement to
// `test-presence`'s FILE-mirror rule: it catches a method a `*Service` interface DECLARES but no test
// ever invokes (wired into the contract with zero behavioral coverage). Enumerates every exported
// `*Service` interface's members per `domain/<d>/contract/service.ts` and requires a boundary-anchored
// service call `<service>.<verb>(` or its `create<Verb>(` factory call in domain tests. COMMENT POSTURE:
// comment-SAFE — AST CallExpressions only. DEFERRED is a ratchet (bus-coverage.ts precedent).
import type { CallExpression, InterfaceDeclaration, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const SERVICE_CONTRACT_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\/service\.ts$/u;
const DOMAIN_TEST_RE = /\/tests\/server\/domain\/(?<domain>[^/]+)\//u;
const SERVICE_FACTORY_RE = /^create[A-Z].*Service$/u;

// Verbs DECLARED on a *Service interface with zero test invocation anywhere — the W1i backlog. A new
// uncovered verb NOT on this list is RED.
//
// TWO-SIDED (GATE-AUTHORING.md §4.4/§4.8 — the header always claimed the bus-coverage ratchet precedent;
// this is the arm that makes it true): a row that suppressed nothing this run is RED, because a burn-down
// list that keeps rows after their tests land stops being a burn-down and starts being a permanent grant.
// Both ways it can go stale: the verb got its test, or the verb (or its whole domain contract) is gone.
// The arm self-guards on a REAL-TREE ANCHOR (GATE-AUTHORING.md §4.5): the server entrypoint.
const DEFERRED: ExemptionTable = {
  "chat.getRoomOverridesForChat": {
    why: "burn-down W1i (test-support-dry-punchlist.md) — ends when a behavioral test invokes it at tests/server/domain/chat/",
  },
  "discovery.themes": { why: "burn-down W1i (test-support-dry-punchlist.md) — ends when a behavioral test invokes it at tests/server/domain/discovery/" },
};

const GATE_SELF = "tooling/src/verify/gates/contract-verb-presence.ts";
/** Real-tree anchor (GATE-AUTHORING.md §4.5): the server package entrypoint. */
const ANCHOR = "packages/server/src/index.ts";
const STALE_PREFIX =
  "stale DEFERRED row — it suppressed nothing this run: the verb is either covered by a test now or no " +
  "longer declared on its *Service interface. A burn-down row that outlives its gap is a permanent grant " +
  "(ratchet down): ";

/** The DEFERRED keys that actually suppressed a RED this run — the stale arm's truth set. */
const seenDeferred = new Set<string>();

const MESSAGE = (verb: string): string =>
  `${verb} — the *Service interface declares this verb but no test in its domain tree invokes ` +
  "it as a service method or through its `create<Verb>(` factory (core/Spine-Testing.md §5; " +
  "test-support-dry-punchlist.md W1i). Add a behavioral test at tests/server/domain/ or, for a tracked " +
  "gap, a DEFERRED entry in contract-verb-presence.ts.";

/** `create` + PascalCase(verb) — the codebase's verb-factory name (verb-naming gate enforces it). */
function factoryName(verb: string): string {
  return `create${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;
}

/** A verb is COVERED by an AST CallExpression through a service receiver, a binding destructured from a
 *  `create*` service bundle, or its exact `create<Verb>` factory. A same-named helper/declaration/comment is
 *  not evidence that the service boundary ran. */
function calledName(node: CallExpression): string | undefined {
  const expression = node.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  const argument = Node.isElementAccessExpression(expression) ? expression.getArgumentExpression() : undefined;
  return argument !== undefined && Node.isStringLiteral(argument) ? argument.getLiteralText() : undefined;
}

/** A bare identifier is a service invocation only when it was destructured from a runtime service factory.
 *  This is the bundle shape used by domain integration tests (`const { listChats } = createRead(...)`). */
function isFactoryBoundVerb(call: CallExpression, verb: string): boolean {
  if (!Node.isIdentifier(call.getExpression())) {
    return false;
  }
  return call
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .some((declaration) => {
      const name = declaration.getNameNode();
      const initializer = declaration.getInitializer();
      const factoryCall = initializer === undefined ? undefined : unwrapExpression(initializer);
      if (!(Node.isObjectBindingPattern(name) && factoryCall !== undefined && Node.isCallExpression(factoryCall))) {
        return false;
      }
      const factory = calledName(factoryCall);
      return factory?.startsWith("create") === true && name.getElements().some((element) => element.getName() === verb);
    });
}

function isServiceFactoryCall(call: CallExpression): boolean {
  const name = calledName(call);
  return name !== undefined && SERVICE_FACTORY_RE.test(name);
}

function isAssembledServiceExpression(node: Node, seen = new Set<string>()): boolean {
  const expression = unwrapExpression(node);
  if (Node.isCallExpression(expression)) {
    if (isServiceFactoryCall(expression)) {
      return true;
    }
    const helperName = calledName(expression);
    if (helperName === undefined) {
      return false;
    }
    const helper = expression.getSourceFile().getFunction(helperName);
    return (
      helper?.getDescendantsOfKind(SyntaxKind.ReturnStatement).some((statement) => {
        const returned = statement.getExpression();
        return returned !== undefined && isAssembledServiceExpression(returned, seen);
      }) === true
    );
  }
  if (!Node.isIdentifier(expression)) {
    return false;
  }
  const name = expression.getText();
  const key = `${expression.getSourceFile().getFilePath()}:${name}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  const declaration = expression
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((candidate) => candidate.getName() === name);
  const initializer = declaration?.getInitializer();
  return initializer !== undefined && isAssembledServiceExpression(initializer, seen);
}

function isAssembledServiceCall(call: CallExpression): boolean {
  const expression = unwrapExpression(call.getExpression());
  if (Node.isPropertyAccessExpression(expression) || Node.isElementAccessExpression(expression)) {
    return isAssembledServiceExpression(expression.getExpression());
  }
  return false;
}

function isCovered(files: readonly SourceFile[], verb: string): boolean {
  const factory = factoryName(verb);
  return files.some((sf) =>
    sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
      const name = calledName(call);
      if (name === factory) {
        return true;
      }
      return name === verb && (isAssembledServiceCall(call) || isFactoryBoundVerb(call, verb));
    }),
  );
}

/** A property member is verb-shaped when its type is a function type (`(…) => …`) — the codebase's
 *  `readonly send: (params) => Promise<…>` idiom. `MethodSignature` members are verbs directly. */
function interfaceVerbNames(iface: InterfaceDeclaration): string[] {
  const names: string[] = [];
  for (const member of iface.getMembers()) {
    if (Node.isMethodSignature(member)) {
      names.push(member.getName());
      continue;
    }
    if (Node.isPropertySignature(member)) {
      const typeNode = member.getTypeNode();
      if (typeNode !== undefined && Node.isFunctionTypeNode(typeNode)) {
        names.push(member.getName());
      }
    }
  }
  return names;
}

/** Every verb declared by the domain's `*Service` interfaces (name ends exactly in `Service` — excludes
 *  `*ServiceDeps`, which is a DI bundle, not the verb surface). */
function serviceVerbs(contract: SourceFile): string[] {
  const verbs: string[] = [];
  for (const iface of contract.getInterfaces()) {
    if (iface.isExported() && iface.getName().endsWith("Service")) {
      verbs.push(...interfaceVerbNames(iface));
    }
  }
  return verbs;
}

/** Every test file under `tests/server/domain/<domain>/`. */
function domainTestFiles(domain: string, files: readonly SourceFile[]): SourceFile[] {
  return files.filter((sf) => DOMAIN_TEST_RE.exec(sf.getFilePath())?.groups?.["domain"] === domain);
}

/** The whole-tree reconciliation shared by the legacy Check and the single-pass `run` descriptor: each
 *  domain's *Service verbs vs its test-tree invocation corpus. */
function reconcileContractVerbPresence(project: Project): Violation[] {
  const files = project.getSourceFiles();
  const violations: Violation[] = [];
  for (const contract of files) {
    const match = SERVICE_CONTRACT_RE.exec(contract.getFilePath());
    const domain = match?.groups?.["domain"];
    if (domain === undefined) {
      continue;
    }
    const corpus = domainTestFiles(domain, files);
    const file = `packages/server/src/domain/${domain}/contract/service.ts`;
    for (const verb of serviceVerbs(contract)) {
      const key = `${domain}.${verb}`;
      if (isCovered(corpus, verb)) {
        continue;
      }
      if (key in DEFERRED) {
        seenDeferred.add(key);
        continue;
      }
      violations.push({ file, line: 1, message: MESSAGE(key) });
    }
  }
  return violations;
}

export const gate: GateDescriptor = {
  name: "contract-verb-presence",
  docRow: "core/Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a *Service interface declares a verb that no test in its domain tree invokes — a wired-but-never-run verb (add a behavioral test at tests/server/domain/, or a tracked DEFERRED entry in contract-verb-presence.ts). core/Spine-Testing.md §5.",
  fix: "add a behavioral test that invokes the verb (or its create<Verb>( factory) under tests/server/domain/<domain>/, or add a cited DEFERRED entry.",
  run: (ctx: GateRunCtx) => {
    seenDeferred.clear();
    for (const v of reconcileContractVerbPresence(ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    if (!fileLoaded(ctx, ANCHOR)) {
      return; // synthetic tree — the ratchet is a whole-tree claim
    }
    for (const key of Object.keys(DEFERRED)) {
      if (!seenDeferred.has(key)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}"${key}" — delete the row in tooling/src/verify/gates/contract-verb-presence.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  uncoveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = 'nothing';\n",
      },
      expect: { messageIncludes: "no test in its domain tree invokes" },
      why: "a Service verb (uncoveredVerb) with no test invocation in the domain tree — a dead-wired verb",
    },
    {
      // a longer identifier ending in the verb name (rebuild vs build) is NOT boundary-anchored coverage.
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly build: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "await rebuild({ id: 1 });\n",
      },
      expect: { messageIncludes: "hub.build" },
      why: "a bare call to a LONGER identifier ending in the verb name (rebuild) does not count as coverage",
    },
    {
      // COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction — the one that silently disarms the
      // gate: a verb NAMED in a test comment is not an invocation.
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly parkedVerb: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "// TODO cover parkedVerb() — createParkedVerb( needs a fixture first.\nexport const q = 1;\n",
      },
      expect: { messageIncludes: "hub.parkedVerb" },
      why: "COMMENT POSTURE: the corpus is read as CODE, so a TODO naming the verb (and its factory) is not coverage — a file-text scan called this verb covered and the gate went green on exactly the wired-with-zero-coverage shape it exists to find",
    },
    {
      // MethodSignature members (not just readonly-arrow properties) are enumerated as verbs.
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  save(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = 'nothing';\n",
      },
      expect: { messageIncludes: "hub.save" },
      why: "a MethodSignature member is enumerated as a verb too — flags when uncovered",
    },
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly save: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "function save() {}\nsave();\n",
      },
      expect: { messageIncludes: "hub.save" },
      why: "a same-named bare helper call is not evidence that the HubService method ran",
    },
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly save: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "logger.save();\n",
      },
      expect: { messageIncludes: "hub.save" },
      why: "a same-named method on an unrelated receiver is not evidence that the assembled HubService ran",
    },
    {
      files: {
        [ANCHOR]: "export const server = 1;\n",
        "packages/server/src/domain/discovery/contract/service.ts": "export interface DiscoveryService {\n  readonly themes: () => void;\n}\n",
        "packages/server/src/domain/chat/contract/service.ts": "export interface ChatService {\n  readonly getRoomOverridesForChat: () => void;\n}\n",
        "tests/server/domain/chat/x.test.ts": "const service = createChatService(ctx);\nawait service.getRoomOverridesForChat({ id: 1 });\n",
      },
      expect: { count: 1, messageIncludes: "stale DEFERRED row" },
      why: "THE RATCHET'S OTHER SIDE: the anchor is loaded; discovery.themes is still uncovered and keeps its row, but chat.getRoomOverridesForChat now HAS its test — the burn-down row suppressed nothing and must be pruned, exactly as the header's bus-coverage precedent promised",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  coveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "const service = createHubService(ctx);\nexport const q = service.coveredVerb();\n",
      },
      why: "the verb is invoked on a service assembled by its domain factory — covered, passes",
    },
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  save(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "const svc = createHubService(ctx);\nconst alias = svc;\nalias.save();\n",
      },
      why: "a local alias of the assembled service preserves receiver identity — covered, passes",
    },
    {
      // covered only by its create<Verb>( factory (the alias-invoked closure shape).
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly build: () => void;\n}\n",
        "tests/server/domain/hub/build.int.test.ts": "const run = createBuild({ db });\nawait run();\n",
      },
      why: "a verb covered only by its create<Verb>( factory (alias-invoked) is covered — passes",
    },
    {
      // a DEFERRED entry (discovery.themes) suppresses its RED — the tracked W1i backlog.
      files: {
        "packages/server/src/domain/discovery/contract/service.ts": "export interface DiscoveryService {\n  readonly themes: () => void;\n}\n",
      },
      why: "a DEFERRED verb (discovery.themes) is a tracked gap — suppressed, passes; with no anchor in this project the ratchet's stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export const server = 1;\n",
        "packages/server/src/domain/discovery/contract/service.ts": "export interface DiscoveryService {\n  readonly themes: () => void;\n}\n",
        "packages/server/src/domain/chat/contract/service.ts": "export interface ChatService {\n  readonly getRoomOverridesForChat: () => void;\n}\n",
      },
      why: "both burn-down rows STILL EARNED, judged against the real-tree anchor: each verb is declared and still uncovered, so the rows suppress real REDs and neither arm fires",
    },
    {
      // *ServiceDeps (a DI bundle) + non-Service interfaces are not the verb surface.
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubServiceDeps {\n  readonly build: () => void;\n}\nexport interface HubContext {\n  readonly wipe: () => void;\n}\n",
      },
      why: "*ServiceDeps and non-Service interfaces are ignored — only the verb surface counts, passes",
    },
  ],
};
