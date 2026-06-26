// Gate: test-presence (spine/testing.md §5) — required tests on the three surfaces where an untested
// change silently breaks behavior: every domain verbs/*.ts (>=1 .test or .int.test), every
// persistence/*.ts (.int.test), every contract/*.ts that exports a zod schema (.contract.test).
// Tests live at the mirror path (tests/server/<rest>). index.ts and pure-type contracts are exempt.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check, Violation } from "../harness.ts";

const DOMAIN_DIR = "/packages/server/src/domain/";
const SERVER_SRC = "/packages/server/src/";
const EXT_RE = /\.tsx?$/;

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

export const testPresence: Check = {
  name: "test-presence",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(DOMAIN_DIR) || sf.getBaseName() === "index.ts") {
        continue;
      }
      const rel = serverSrcRel(path);
      if (rel === undefined) {
        continue;
      }
      if (rel.includes("/verbs/") && !hasTest(root, rel, [".test.ts", ".int.test.ts"])) {
        violations.push({
          file: `packages/server/src/${rel}`,
          line: 0,
          message:
            "verb has no test — add a .test.ts or .int.test.ts at its mirror (spine/testing.md §5).",
        });
      } else if (rel.includes("/persistence/") && !hasTest(root, rel, [".int.test.ts"])) {
        violations.push({
          file: `packages/server/src/${rel}`,
          line: 0,
          message: "persistence file has no .int.test.ts at its mirror (spine/testing.md §5).",
        });
      } else if (
        rel.includes("/contract/") &&
        hasSchema(sf.getFullText()) &&
        !hasTest(root, rel, [".contract.test.ts"])
      ) {
        violations.push({
          file: `packages/server/src/${rel}`,
          line: 0,
          message: "contract schema has no .contract.test.ts at its mirror (spine/testing.md §5).",
        });
      }
    }
    return violations;
  },
};
