// Gate: contract-verb-presence (core/Spine-Testing.md §5) — the INTERFACE-level complement to
// `test-presence`'s FILE-mirror rule: it catches a method a `*Service` interface DECLARES but no test
// ever invokes (wired into the contract with zero behavioral coverage). Enumerates every exported
// `*Service` interface's members per `domain/<d>/contract/service.ts` and requires a boundary-anchored
// bare call `<verb>(` or its `create<Verb>(` factory call in `tests/server/domain/<d>/**`. DEFERRED is a ratchet (bus-coverage.ts precedent).
import type { InterfaceDeclaration, Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";
import { fileLoaded } from "../pass.ts";

const SERVICE_CONTRACT_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\/service\.ts$/u;
const DOMAIN_TEST_RE = /\/tests\/server\/domain\/(?<domain>[^/]+)\//u;

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

const GATE_SELF = "scripts/check/gates/contract-verb-presence.ts";
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
  `\`${verb.split(".")[1]}(\` or its \`create<Verb>(\` factory (core/Spine-Testing.md §5; ` +
  "test-support-dry-punchlist.md W1i). Add a behavioral test at tests/server/domain/ or, for a tracked " +
  "gap, a DEFERRED entry in contract-verb-presence.ts.";

/** `create` + PascalCase(verb) — the codebase's verb-factory name (verb-naming gate enforces it). */
function factoryName(verb: string): string {
  return `create${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;
}

/** A verb is COVERED when the corpus has a boundary-anchored bare call `<verb>(` (not a longer identifier
 *  ending in the verb) OR its `create<Verb>(` factory call. */
function isCovered(corpus: string, verb: string): boolean {
  return new RegExp(`(?:[^\\w]|^)${verb}\\(|${factoryName(verb)}\\(`, "u").test(corpus);
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

/** The concatenated full text of every test file under `tests/server/domain/<domain>/`. */
function domainTestCorpus(domain: string, files: readonly SourceFile[]): string {
  const parts: string[] = [];
  for (const sf of files) {
    const match = DOMAIN_TEST_RE.exec(sf.getFilePath());
    if (match?.groups?.["domain"] === domain) {
      parts.push(sf.getFullText());
    }
  }
  return parts.join("\n");
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
    const corpus = domainTestCorpus(domain, files);
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
          message: `${STALE_PREFIX}"${key}" — delete the row in scripts/check/gates/contract-verb-presence.ts`,
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
        [ANCHOR]: "export const server = 1;\n",
        "packages/server/src/domain/discovery/contract/service.ts": "export interface DiscoveryService {\n  readonly themes: () => void;\n}\n",
        "packages/server/src/domain/chat/contract/service.ts": "export interface ChatService {\n  readonly getRoomOverridesForChat: () => void;\n}\n",
        "tests/server/domain/chat/x.test.ts": "await getRoomOverridesForChat({ id: 1 });\n",
      },
      expect: { count: 1, messageIncludes: "stale DEFERRED row" },
      why: "THE RATCHET'S OTHER SIDE: the anchor is loaded; discovery.themes is still uncovered and keeps its row, but chat.getRoomOverridesForChat now HAS its test — the burn-down row suppressed nothing and must be pruned, exactly as the header's bus-coverage precedent promised",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  coveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = coveredVerb();\n",
      },
      why: "the verb is invoked (`coveredVerb(`) in the domain test tree — covered, passes",
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
