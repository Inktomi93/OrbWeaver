// Gate: db-enum-from-tuple (D34 — a db enum column derives from a CONTRACTS tuple; db never re-spells a
// union). A drizzle column enum config (`text("x", { enum: … })`) must reference an IDENTIFIER — an
// imported `@orb/contracts`/`@orb/kit` tuple, or a local `as const satisfies readonly <ContractsType>[]`
// tuple (the sanctioned db idiom where no z-schema runtime mirror home exists — chat.ts STREAM_DELTA_KINDS/
// INJECTION_POSITIONS). It must NEVER be an INLINE ARRAY LITERAL (`{ enum: ["a","b"] }`) — an inline
// re-spelling drifts from the union's one home the moment a member is added. AST-scoped to the schema dir;
// the `enum:` key inside a schema-file object literal is unambiguously the drizzle column config.
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SCHEMA_DIR = /\/packages\/db\/src\/schema\//u;
const ENUM_KEY = "enum";

const MESSAGE =
  "drizzle column enum config is an INLINE ARRAY LITERAL — a db enum must derive from an imported " +
  "contracts/kit tuple (or a local `as const satisfies` tuple), never a re-spelled array (D34: db never " +
  "re-spells a union). See Core-Path-Registry-D1-D34.md D34.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const dbEnumFromTuple: Check = {
  name: "db-enum-from-tuple",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      if (!SCHEMA_DIR.test(sf.getFilePath())) {
        continue;
      }
      const rel = relPath(root, sf.getFilePath());
      for (const prop of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
        if (prop.getName() !== ENUM_KEY) {
          continue;
        }
        if (prop.getInitializerOrThrow().isKind(SyntaxKind.ArrayLiteralExpression)) {
          violations.push({ file: rel, line: prop.getStartLineNumber(), message: MESSAGE });
        }
      }
    }
    return violations;
  },
};
