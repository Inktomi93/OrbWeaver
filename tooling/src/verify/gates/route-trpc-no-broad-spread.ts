// Policy: route-trpc-no-broad-spread — a routeTrpc/defineTrpcRoutes object may compose reusable
// finite route maps, but it may not spread a map whose keys are unknowable (`Record<string, unknown>`).
// TypeScript erases a string index while inferring
// an object literal with an explicit sibling, so routeTrpc's generic sees only that sibling and cannot
// reject the hidden spread. This checker-resolved source control owns the evidence the function signature
// cannot observe. It reports the spread operand, which is the declaration that must acquire concrete keys.
//
// SINGLETON: no other policy judges the resolved types of routeTrpc fixture spreads. The LIFO policy
// judges Playwright registration order through syntax and shares no production reader with this one.
import type { CallExpression, SpreadAssignment } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveCallableDeclaration } from "../../_shared/reference-fact-call.ts";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

const TARGET_HOME = "/tests/support/node/route-trpc.ts";
const TARGETS = new Set(["routeTrpc", "defineTrpcRoutes"]);
const MESSAGE =
  "a routeTrpc fixture object spreads a string-indexed route map, so TypeScript can erase those unknown keys and validate only an explicit sibling; give the reusable map concrete AppRouter-derived keys (tests/support/node/route-trpc.ts)";
const FIX = 'replace Record<string, unknown> with defineTrpcRoutes({...}) or TrpcRoutes<"procedure" | ...> before spreading it.';

function routeArgument(call: CallExpression): Node | undefined {
  const resolved = resolveCallableDeclaration(call);
  if (resolved.kind !== "resolved") {
    return;
  }
  const declaration = resolved.value.declaration;
  const name = Node.isFunctionDeclaration(declaration) ? declaration.getName() : undefined;
  const home = declaration.getSourceFile().getFilePath().replaceAll("\\", "/");
  if (name === undefined || !TARGETS.has(name) || !home.endsWith(TARGET_HOME)) {
    return;
  }
  return call.getArguments()[name === "routeTrpc" ? 1 : 0];
}

function hasUnknownKeys(spread: SpreadAssignment): boolean {
  return spread.getExpression().getType().getStringIndexType() !== undefined;
}

export const gate = defineGate({
  id: "route-trpc-no-broad-spread",
  family: "route-trpc-no-broad-spread",
  authority: "hard",
  severity: "error",
  population: { in: ["@tests"], under: ["tests/client/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node): void => {
          if (!Node.isCallExpression(node)) {
            return;
          }
          const argument = routeArgument(node);
          const object = argument === undefined ? undefined : unwrapExpression(argument);
          if (object === undefined || !Node.isObjectLiteralExpression(object)) {
            return;
          }
          for (const spread of object.getProperties().filter(Node.isSpreadAssignment)) {
            if (hasUnknownKeys(spread)) {
              ctx.report.node(spread.getExpression());
            }
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts": "export function routeTrpc(page: unknown, routes: object): Promise<void> { return Promise.resolve(); }\n",
        "tests/client/a11y/mixed-record.ct.tsx":
          'import { routeTrpc } from "../../support/node/route-trpc.ts";\ndeclare const page: unknown;\ndeclare const broad: Readonly<Record<string, unknown>>;\nvoid routeTrpc(page, { health: { ok: true }, ...broad });\n',
      },
      expect: { count: 1, token: "broad" },
      why: "THE REVIEWER COUNTEREXAMPLE: an explicit healthy route makes the routeTrpc generic infer only that fixed key while TypeScript erases the Record spread index; the broad operand must remain a finding",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts": "export function routeTrpc(page: unknown, routes: object): Promise<void> { return Promise.resolve(); }\n",
        "tests/client/a11y/aliased-record.ct.tsx":
          'import { routeTrpc as installTrpc } from "../../support/node/route-trpc.ts";\ndeclare const page: unknown;\ndeclare const broad: Readonly<Record<string, unknown>>;\nvoid installTrpc(page, { health: { ok: true }, ...broad });\n',
      },
      expect: { count: 1, token: "broad" },
      why: "the finding follows compiler symbol identity through an aliased import rather than depending on the local callee spelling",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts": "export function defineTrpcRoutes<const T extends object>(routes: T): T { return routes; }\n",
        "tests/client/features/g/defined-record.ct.tsx":
          'import { defineTrpcRoutes } from "../../../support/node/route-trpc.ts";\ndeclare const broad: Readonly<Record<string, unknown>>;\nexport const routes = defineTrpcRoutes({ health: { ok: true }, ...broad });\n',
      },
      expect: { count: 1, token: "broad" },
      why: "defineTrpcRoutes shares the same inference hole and must reject broad composition before the named map reaches routeTrpc",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts":
          "export type TrpcRoutes<K extends string> = { [P in K]-?: P extends 'health' ? { ok: boolean } : { value: string } };\nexport function routeTrpc(page: unknown, routes: object): Promise<void> { return Promise.resolve(); }\n",
        "tests/client/features/g/finite-map.ct.tsx":
          'import { routeTrpc, type TrpcRoutes } from "../../../support/node/route-trpc.ts";\ndeclare const page: unknown;\ndeclare const finite: TrpcRoutes<"other">;\nvoid routeTrpc(page, { health: { ok: true }, ...finite });\n',
      },
      why: "the sanctioned reusable seam: a finite AppRouter-derived map with required keys retains its procedure identity through the spread",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts":
          "export type TrpcRoutes = { health?: { ok: boolean }; other?: { value: string } };\nexport function routeTrpc(page: unknown, routes: object): Promise<void> { return Promise.resolve(); }\n",
        "tests/client/features/g/default-map.ct.tsx":
          'import { routeTrpc, type TrpcRoutes } from "../../../support/node/route-trpc.ts";\ndeclare const page: unknown;\ndeclare const checked: TrpcRoutes;\nvoid routeTrpc(page, { health: { ok: true }, ...checked });\n',
      },
      why: "an all-procedure TrpcRoutes map has optional keys but every supplied value was AppRouter-checked at its declaration, so key optionality alone is not a finding",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts":
          "export type TrpcRoutes<K extends string> = Partial<{ [P in K]: P extends 'health' ? { ok: boolean } : { value: string } }>;\nexport function routeTrpc(page: unknown, routes: object): Promise<void> { return Promise.resolve(); }\n",
        "tests/client/features/g/finite-optional-map.ct.tsx":
          'import { routeTrpc, type TrpcRoutes } from "../../../support/node/route-trpc.ts";\ndeclare const page: unknown;\ndeclare const checked: TrpcRoutes<"other">;\nvoid routeTrpc(page, { health: { ok: true }, ...checked });\n',
      },
      why: "a finite optional AppRouter-derived map remains safe because any supplied responder was checked at the named declaration",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts": "export function routeTrpc(page: unknown, routes: object): Promise<void> { return Promise.resolve(); }\n",
        "tests/client/features/g/inline.ct.tsx":
          'import { routeTrpc } from "../../../support/node/route-trpc.ts";\ndeclare const page: unknown;\nvoid routeTrpc(page, { health: { ok: true } });\n',
      },
      why: "an ordinary inline route map has no spread operand and remains the direct source-compatible fixture shape",
    },
    {
      mode: "types",
      files: {
        "tests/support/node/route-trpc.ts": "export function routeTrpc(page: unknown, routes: object): Promise<void> { return Promise.resolve(); }\n",
        "tests/client/features/g/local.ct.tsx":
          "function routeTrpc(page: unknown, routes: object): void { void page; void routes; }\ndeclare const page: unknown;\ndeclare const broad: Record<string, unknown>;\nrouteTrpc(page, { health: { ok: true }, ...broad });\n",
      },
      why: "compiler identity, not callee spelling: an unrelated local function named routeTrpc is outside this policy",
    },
  ],
});
