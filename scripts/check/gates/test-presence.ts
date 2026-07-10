// Gate: test-presence (core/Spine-Testing.md §5) — required tests on the surfaces where an untested change
// silently breaks behavior:
//   • every domain verbs/*.ts            → .test or .int.test
//   • every domain persistence/*.ts      → .int.test
//   • every domain contract/*.ts w/ zod  → .contract.test
//   • every infra/ or foundation/ file with RUNTIME LOGIC (an exported function/class/arrow-const — the
//     security belts, adapters, dispatchers, the credential firewall, the debug-auth gate) → .test or
//     .int.test. This tier WAS a blind spot: agent-sdk's env firewall + the debug-auth gate shipped with
//     zero tests because the gate only scanned domain/. Pure-type files + index.ts barrels are exempt.
// Tests live at the mirror path (tests/server/<rest>).
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const DOMAIN_DIR = "/packages/server/src/domain/";
const SERVER_SRC = "/packages/server/src/";
const CONTRACTS_SRC = "/packages/contracts/src/";
const EXT_RE = /\.tsx?$/u;

const MSG = {
  verb: "verb has no test — add a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5).",
  persistence: "persistence file has no .int.test.ts at its mirror (core/Spine-Testing.md §5).",
  contract: "contract schema has no .contract.test.ts at its mirror (core/Spine-Testing.md §5).",
  sharedContract:
    "shared contract schema has no .contract.test.ts at its mirror (core/Spine-Testing.md §5).",
  infra:
    "infra/foundation file with runtime logic has no test — security belts/adapters/dispatchers get a .test.ts or .int.test.ts at their mirror (core/Spine-Testing.md §5). Pure-type + index files are exempt.",
  runner:
    "workloads runner with real logic has no test — add a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5). A D58 no-op stub (reports + returns `{ deferred: true }`, no `ctx.env` call) is exempt until it's filled in.",
} as const;

function serverSrcRel(path: string): string | undefined {
  const parts = path.split(SERVER_SRC);
  return parts.length > 1 ? parts[1] : undefined;
}

function contractsSrcRel(path: string): string | undefined {
  const parts = path.split(CONTRACTS_SRC);
  return parts.length > 1 ? parts[1] : undefined;
}

function hasTest(root: string, pkg: string, rel: string, kinds: readonly string[]): boolean {
  const base = rel.replace(EXT_RE, "");
  return kinds.some((kind) => existsSync(join(root, "tests", pkg, `${base}${kind}`)));
}

function hasSchema(text: string): boolean {
  return (
    text.includes("z.object(") || text.includes("z.enum(") || text.includes("z.discriminatedUnion(")
  );
}

// A workloads runner is a D58 no-op STUB (inert — the kind exists so `RUNNERS`/exhaustive-dispatch stay
// green, but the real pass lands in a later wave) when its body only reports + returns the `DeferredResult`
// and never touches its injected env. There is no behavior to regress, so it's exempt UNTIL filled in:
// adding a real `ctx.env.*` call drops the exemption and the gate then demands a test. Detected on SOURCE
// SHAPE, not a static list, so the 16 current stubs need no per-file allowlist and can't go stale.
function isDeferredStubRunner(text: string): boolean {
  return text.includes("deferred: true") && !text.includes("ctx.env");
}

// A file carries runtime LOGIC (vs only types/data) if it exports a function, a class, or a const bound
// to an arrow/function expression. Pure type/interface files and pure data tuples need no behavioral test.
function hasCallableExport(sf: SourceFile): boolean {
  if (sf.getFunctions().some((f) => f.isExported())) {
    return true;
  }
  if (sf.getClasses().some((c) => c.isExported())) {
    return true;
  }
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        return true;
      }
    }
  }
  return false;
}

function missing(pkg: string, rel: string, message: string): Violation {
  return { file: `packages/${pkg}/src/${rel}`, line: 0, message };
}

function pushDomain(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (rel.includes("/verbs/") && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.verb));
  }
  if (rel.includes("/persistence/") && !hasTest(root, "server", rel, [".int.test.ts"])) {
    out.push(missing("server", rel, MSG.persistence));
  }
  if (
    rel.includes("/contract/") &&
    hasSchema(sf.getFullText()) &&
    !hasTest(root, "server", rel, [".contract.test.ts"])
  ) {
    out.push(missing("server", rel, MSG.contract));
  }
  if (
    rel.includes("/workloads/runners/") &&
    !isDeferredStubRunner(sf.getFullText()) &&
    !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])
  ) {
    out.push(missing("server", rel, MSG.runner));
  }
}

function pushInfra(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  const inTier = rel.startsWith("infra/") || rel.startsWith("foundation/");
  if (
    inTier &&
    hasCallableExport(sf) &&
    !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])
  ) {
    out.push(missing("server", rel, MSG.infra));
  }
}

function pushContracts(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (hasSchema(sf.getFullText()) && !hasTest(root, "contracts", rel, [".contract.test.ts"])) {
    out.push(missing("contracts", rel, MSG.sharedContract));
  }
}

export const testPresence: Check = {
  name: "test-presence",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const isIndex = sf.getBaseName() === "index.ts";

      const serverRel = serverSrcRel(sf.getFilePath());
      if (serverRel !== undefined) {
        // Server barrels (domain/infra `index.ts`) are pure re-exports — exempt. A contracts `index.ts` is
        // NOT a barrel (the domain's schemas co-locate there), so it is checked below.
        if (isIndex) {
          continue;
        }
        if (sf.getFilePath().includes(DOMAIN_DIR)) {
          pushDomain(root, serverRel, sf, violations);
        } else {
          pushInfra(root, serverRel, sf, violations);
        }
        continue;
      }

      // Contracts arm: a schema-bearing file is presence-gated whether or not it is named `index.ts` — the
      // contracts convention co-locates the domain's zod schemas in `index.ts`, so a blanket barrel-skip
      // silently exempted whole domains (imagery slipped through with zero tests). A pure-type/re-export
      // `index.ts` carries no schema and passes `hasSchema` → still exempt.
      const contractsRel = contractsSrcRel(sf.getFilePath());
      if (contractsRel !== undefined) {
        pushContracts(root, contractsRel, sf, violations);
      }
    }
    return violations;
  },
};
