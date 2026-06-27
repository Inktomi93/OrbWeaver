// Gate: test-presence (spine/testing.md §5) — required tests on the surfaces where an untested change
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
const EXT_RE = /\.tsx?$/;

const MSG = {
  verb: "verb has no test — add a .test.ts or .int.test.ts at its mirror (spine/testing.md §5).",
  persistence: "persistence file has no .int.test.ts at its mirror (spine/testing.md §5).",
  contract: "contract schema has no .contract.test.ts at its mirror (spine/testing.md §5).",
  infra:
    "infra/foundation file with runtime logic has no test — security belts/adapters/dispatchers get a .test.ts or .int.test.ts at their mirror (spine/testing.md §5). Pure-type + index files are exempt.",
} as const;

function serverSrcRel(path: string): string | undefined {
  const parts = path.split(SERVER_SRC);
  return parts.length > 1 ? parts[1] : undefined;
}

function hasTest(root: string, rel: string, kinds: readonly string[]): boolean {
  const base = rel.replace(EXT_RE, "");
  return kinds.some((kind) => existsSync(join(root, "tests", "server", `${base}${kind}`)));
}

function hasSchema(text: string): boolean {
  return (
    text.includes("z.object(") || text.includes("z.enum(") || text.includes("z.discriminatedUnion(")
  );
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

function missing(rel: string, message: string): Violation {
  return { file: `packages/server/src/${rel}`, line: 0, message };
}

function pushDomain(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (rel.includes("/verbs/") && !hasTest(root, rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing(rel, MSG.verb));
  }
  if (rel.includes("/persistence/") && !hasTest(root, rel, [".int.test.ts"])) {
    out.push(missing(rel, MSG.persistence));
  }
  if (
    rel.includes("/contract/") &&
    hasSchema(sf.getFullText()) &&
    !hasTest(root, rel, [".contract.test.ts"])
  ) {
    out.push(missing(rel, MSG.contract));
  }
}

function pushInfra(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  const inTier = rel.startsWith("infra/") || rel.startsWith("foundation/");
  if (inTier && hasCallableExport(sf) && !hasTest(root, rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing(rel, MSG.infra));
  }
}

export const testPresence: Check = {
  name: "test-presence",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      if (sf.getBaseName() === "index.ts") {
        continue;
      }
      const rel = serverSrcRel(sf.getFilePath());
      if (rel === undefined) {
        continue;
      }
      if (sf.getFilePath().includes(DOMAIN_DIR)) {
        pushDomain(root, rel, sf, violations);
      } else {
        pushInfra(root, rel, sf, violations);
      }
    }
    return violations;
  },
};
