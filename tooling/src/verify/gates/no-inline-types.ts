import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const REGEX_DATA_FORMS_STATE_LIB = /\/packages\/client\/src\/(data|forms|state|lib)\//;

// One node-anchored message (NOT the explicit-Finding overload) so `// @orb-gate-ignore no-inline-types`
// leading comments are honored — the Finding overload has no node and silently defeats suppressions.
const MESSAGE =
  "exported type/interface/zod-schema outside a type home — feature types live in the feature's contract/ (or @orb/contracts), not in a verb/service/component/substrate. Move it to contract/ and import it. See Spine-TypeScript-and-Patterns.md §7.4.";

function isTypeHome(path: string): boolean {
  if (path.includes("/contract/")) {
    return true;
  }
  if (path.endsWith("/contract.ts")) {
    return true;
  }
  if (path.includes("/packages/kit/")) {
    return true;
  }
  if (path.includes("/packages/contracts/")) {
    return true;
  }
  if (path.includes("/packages/db/")) {
    return true;
  }
  if (path.includes("/packages/ui/")) {
    return true;
  }
  if (REGEX_DATA_FORMS_STATE_LIB.test(path)) {
    return true;
  }
  if (path.includes("/server/src/kit/")) {
    return true;
  }
  if (path.includes("/tests/")) {
    return true;
  }
  if (path.includes("/scripts/")) {
    return true;
  }
  // DELETED (2026-08-22, #408): a `/tools/` clause used to sit here. It predated `domain/rpg/tools/`
  // (GritQL migration, 64ab26501) and by then exempted that subsystem by pure string accident — a census of
  // the tree found `/tools/` matching EXACTLY two directories, `packages/server/src/domain/rpg/tools/` and
  // its already-exempt test mirror, so the clause had no legitimate remaining target: the tooling tree is
  // `tooling/src/<tool>/`, which rides the `_shared`/`contract/` clauses instead. Narrowing it would have
  // been a no-op with a comment; the four types it was hiding (RosterRefIndex/ScenePatch/ExtractionMints in
  // apply.ts, DiceRoll in dice.ts) now live in `domain/rpg/contract/`, where §7.4 puts a domain-internal
  // shape. Do NOT reintroduce a path clause for a subsystem — a tool subsystem is domain code.
  // @orb/tooling: `_shared/` is the plumbing floor (the tooling analog of kit) and `<tool>/contract/`
  // rides the `/contract/` clause above — a tool's ops/lib exporting a shape is judged, forcing the
  // five-slot discipline (docs/architecture/core/Core-Tooling-Law.md §2.5).
  if (path.includes("/tooling/src/_shared/")) {
    return true;
  }
  if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
    return true;
  }
  return false;
}

function isDomainFeature(path: string): boolean {
  return path.includes("/packages/server/src/domain/");
}

function isZodSchema(node: Node): boolean {
  if (!Node.isVariableDeclaration(node)) {
    return false;
  }
  const initializer = node.getInitializer();
  if (!(initializer && Node.isCallExpression(initializer))) {
    return false;
  }
  const expression = initializer.getExpression().getText();
  return expression === "z.object" || expression === "z.enum" || expression === "z.discriminatedUnion";
}

export const gate: GateDescriptor = {
  name: "no-inline-types",
  docRow: "Spine-TypeScript-and-Patterns.md §7.4",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "move type to contract/ and import it",
  scanRoot: (_p) => true,
  kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.VariableDeclaration, SyntaxKind.InterfaceDeclaration],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();

    if (Node.isInterfaceDeclaration(node)) {
      if (node.hasExportKeyword() && isDomainFeature(path) && !isTypeHome(path)) {
        ctx.report(node);
      }
      return;
    }

    if (isTypeHome(path)) {
      return;
    }

    if (Node.isTypeAliasDeclaration(node)) {
      if (node.hasExportKeyword()) {
        ctx.report(node);
      }
      return;
    }

    // VariableDeclaration — the export keyword lives on the enclosing VariableStatement.
    if (Node.isVariableDeclaration(node) && isZodSchema(node)) {
      const statement = node.getVariableStatement();
      if (statement !== undefined && statement.hasExportKeyword()) {
        ctx.report(statement);
      }
    }
  },
  mustFlag: [
    {
      files: "export type Foo = string;\n",
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: "exported type in verb",
    },
    {
      files: "export interface Foo { x: string }\n",
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: "exported interface in verb",
    },
    {
      files: 'import { z } from "zod"; export const Foo = z.object({});\n',
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: "exported zod schema in verb",
    },
    {
      files: "export type Foo = string;\n",
      at: "tooling/src/snap/ops/capture.ts",
      expect: { count: 1 },
      why: "a tool's ops/ exporting a shape — tool types live in the tool's contract/ slot (Core-Tooling-Law.md §2.5)",
    },
    {
      files: "export interface Foo { x: string }\n",
      at: "packages/server/src/domain/rpg/tools/apply.ts",
      expect: { count: 1 },
      why: "#408 — the deleted `/tools/` clause used to exempt this by string accident; a domain tool SUBSYSTEM is domain code and its shapes belong in the domain's contract/",
    },
  ],
  mustPass: [
    {
      files: "export type Foo = string;\n",
      at: "packages/server/src/domain/x/contract/types.ts",
      why: "in contract dir",
    },
    {
      files: "type Foo = string;\n",
      at: "packages/server/src/domain/x/verb.ts",
      why: "not exported",
    },
    {
      files: "export type Foo = string;\n",
      at: "tooling/src/_shared/x.ts",
      why: "tooling _shared is the plumbing floor — a sanctioned type home (Core-Tooling-Law.md §2.4)",
    },
    {
      files: "export type Foo = string;\n",
      at: "tooling/src/snap/contract/types.ts",
      why: "a tool's contract/ slot rides the /contract/ clause — the five-slot type home",
    },
  ],
};
