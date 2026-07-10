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
import type { InterfaceDeclaration, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

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

export const contractVerbPresence: Check = {
  name: "contract-verb-presence",
  run: ({ project }): Violation[] => {
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
        if (isCovered(corpus, verb)) {
          continue;
        }
        if (DEFERRED.has(`${domain}.${verb}`)) {
          continue;
        }
        violations.push({ file, line: 1, message: MESSAGE(`${domain}.${verb}`) });
      }
    }
    return violations;
  },
};
