// Gate: contract-verb-presence (core/Spine-Testing.md §5) — the INTERFACE-level complement to
// `test-presence`'s FILE-mirror rule. `test-presence` proves every `verbs/*.ts` FILE carries a mirror
// test; it can NOT see a method that a domain's `*Service` interface DECLARES but no test ever invokes
// (a verb wired into the contract with zero behavioral coverage — the "we add to the contract and never
// know" hole). This gate closes it: for each `domain/<d>/contract/service.ts`, enumerate the methods of
// every exported interface whose name ends in `Service` (both `MethodSignature` and
// `PropertySignature`-with-FunctionType members — the codebase writes verbs as readonly arrow-typed
// properties), and require an invocation-shaped text match (`.methodName(`) somewhere in that domain's
// test tree `tests/server/domain/<d>/**`. Presence is grep-style over the harness project's already-loaded
// test files — NOT a filename convention: world-info/tag organize their tests differently and are fully
// covered, so a mirror rule would false-fire.
//
// WHY — the 2026-07-09 ts-morph census (docs/architecture/history/test-support-dry-punchlist.md §5) found
// 269 Service-interface verbs, 258 (96%) invoked in tests, but 10 with ZERO invocation anywhere — the
// replay/list spine `FINAL-Chat-Tab-Redesign-UX.md` §9 leans on among them ("wiring-verified, not
// run-verified", now measured fact). Adding a verb with no test then FAILS `pnpm check`.
//
// The DEFERRED list is a RATCHET (bus-coverage.ts precedent): a listed verb that GAINS a test still passes
// (the entry is simply stale — prune it as W1i burns the debt down); a NEW uncovered verb goes RED.
//
// INVOCATION SHAPE (calibrated against the real tree, NOT the audit's `.methodName(` framing — that
// demanded a dot prefix the bare-imported-verb tests don't have and false-negatived 8 of the audit's 10):
// a verb is COVERED when its test tree contains a boundary-anchored bare call `<verb>(` (the tests import
// the verb factory's closure and call it directly) OR its factory `create<Pascal(verb)>(` (the buddy
// `createResolveSpeakerIdentity(...)` shape, where the returned closure is invoked under a local alias so
// the verb name never appears as a call). Measured zero-coverage set after this calibration: exactly 2.
import type { InterfaceDeclaration, Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const SERVICE_CONTRACT_RE =
  /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\/service\.ts$/u;
const DOMAIN_TEST_RE = /\/tests\/server\/domain\/(?<domain>[^/]+)\//u;

// Verbs DECLARED on a *Service interface with zero test invocation anywhere — the W1i backlog. Prune an
// entry the moment its test lands (a covered verb passes regardless; the list only suppresses REDs). A
// new uncovered verb NOT on this list is RED.
const DEFERRED: ReadonlySet<string> = new Set([
  "chat.getRoomOverridesForChat", // burn-down: W1i
  "discovery.themes", // burn-down: W1i
]);

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
      if (isCovered(corpus, verb) || DEFERRED.has(`${domain}.${verb}`)) {
        continue;
      }
      violations.push({ file, line: 1, message: MESSAGE(`${domain}.${verb}`) });
    }
  }
  return violations;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a whole-project RECONCILIATION via `run`) ────────────────────
// contract-verb-presence reconciles each domain's *Service interface verbs against its test-tree
// invocation corpus (grep-style over the loaded test files) — a whole-tree cross-file check, ported as a
// `run` descriptor reusing the exact reconcile logic. The DEFERRED map suppresses tracked gaps (no stale
// arm — a covered deferred verb just passes, so no synthetic-tree misfire). A tree with no service.ts is
// vacuous. Byte-identical to the legacy Check.
export const gate: GateDescriptor = {
  name: "contract-verb-presence",
  docRow: "core/Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a *Service interface declares a verb that no test in its domain tree invokes — a wired-but-never-run verb (add a behavioral test at tests/server/domain/, or a tracked DEFERRED entry in contract-verb-presence.ts). core/Spine-Testing.md §5.",
  fix: "add a behavioral test that invokes the verb (or its create<Verb>( factory) under tests/server/domain/<domain>/, or add a cited DEFERRED entry.",
  run: (ctx) => {
    for (const v of reconcileContractVerbPresence(ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubService {\n  uncoveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = 'nothing';\n",
      },
      expect: { messageIncludes: "no test in its domain tree invokes" },
      why: "a Service verb (uncoveredVerb) with no test invocation in the domain tree — a dead-wired verb",
    },
    {
      // a longer identifier ending in the verb name (rebuild vs build) is NOT boundary-anchored coverage.
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubService {\n  readonly build: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "await rebuild({ id: 1 });\n",
      },
      expect: { messageIncludes: "hub.build" },
      why: "a bare call to a LONGER identifier ending in the verb name (rebuild) does not count as coverage",
    },
    {
      // MethodSignature members (not just readonly-arrow properties) are enumerated as verbs.
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubService {\n  save(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = 'nothing';\n",
      },
      expect: { messageIncludes: "hub.save" },
      why: "a MethodSignature member is enumerated as a verb too — flags when uncovered",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubService {\n  coveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = coveredVerb();\n",
      },
      why: "the verb is invoked (`coveredVerb(`) in the domain test tree — covered, passes",
    },
    {
      // covered only by its create<Verb>( factory (the alias-invoked closure shape).
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubService {\n  readonly build: () => void;\n}\n",
        "tests/server/domain/hub/build.int.test.ts":
          "const run = createBuild({ db });\nawait run();\n",
      },
      why: "a verb covered only by its create<Verb>( factory (alias-invoked) is covered — passes",
    },
    {
      // a DEFERRED entry (discovery.themes) suppresses its RED — the tracked W1i backlog.
      files: {
        "packages/server/src/domain/discovery/contract/service.ts":
          "export interface DiscoveryService {\n  readonly themes: () => void;\n}\n",
      },
      why: "a DEFERRED verb (discovery.themes) is a tracked gap — suppressed, passes",
    },
    {
      // *ServiceDeps (a DI bundle) + non-Service interfaces are not the verb surface.
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubServiceDeps {\n  readonly build: () => void;\n}\n" +
          "export interface HubContext {\n  readonly wipe: () => void;\n}\n",
      },
      why: "*ServiceDeps and non-Service interfaces are ignored — only the verb surface counts, passes",
    },
  ],
};
