// Server graph constructors are consumed only by the canonical Node test root, never a second test assembly.
// Family test-production-clone shares the canonical assembly home; identities come from floor/reference-fact.
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../floor/code-facts/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { hasAssemblyConstructorEvidence, isServerAssemblyConstructor, SERVER_TEST_ASSEMBLY_HOME } from "../lib/test-assembly-home.ts";

const SERVICE = "packages/server/src/domain/notifications/service.ts";
const CONTRACT = "packages/server/src/domain/notifications/contract/service.ts";
const API = {
  [CONTRACT]: "export interface Inbox { readonly list: () => number }\n",
  [SERVICE]: 'import type { Inbox } from "./contract/service.ts"; export function assemble(): Inbox { return { list: () => 1 }; }\n',
  "packages/server/src/domain/notifications/index.ts": 'export { assemble } from "./service.ts";\n',
};
const DOOR = "../../../../packages/server/src/domain/notifications/index.ts";

export const gate = defineGate({
  id: "test-assembly-home",
  family: "test-production-clone",
  authority: "hard",
  severity: "error",
  population: "@tests",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: "a test constructs a server service graph outside the canonical Node test root (Spine-Testing section 10).",
  fix: "use @orb/testkit/node/server.ts or its composed fixtures; builders consume existing graph operations and external adapters replace only physical execution.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node, file) => {
          if (!Node.isCallExpression(node) || ctx.relativePath(file) === SERVER_TEST_ASSEMBLY_HOME) {
            return;
          }
          const origin = resolveModuleMemberOrigin(node.getExpression());
          if (origin.kind === "resolved") {
            if (isServerAssemblyConstructor(origin.value)) {
              ctx.report.node(node.getExpression(), {
                message: `construct this graph through ${SERVER_TEST_ASSEMBLY_HOME}; the canonical service factory and its owned return contract identify an alternate assembly.`,
              });
            }
            return;
          }
          if (hasAssemblyConstructorEvidence(origin)) {
            ctx.report.node(node.getExpression(), {
              message: `cannot establish the invocation of a governed assembly constructor: ${origin.detail}; use ${SERVER_TEST_ASSEMBLY_HOME}.`,
            });
          }
        },
      },
    ],
  }),
  mustFlag: [
    ...[
      'import type { Inbox } from "./contract/service.ts"; export function assemble(): { readonly service: Inbox; readonly metadata: string } { return { service: { list: () => 1 }, metadata: "wrapped" }; }',
      'import type { Inbox } from "./contract/service.ts"; type Alias = Inbox; export async function assemble(): Promise<{ readonly differentlyNamed: Alias }> { return { differentlyNamed: { list: () => 1 } }; }',
      'import type { Inbox } from "./contract/service.ts"; export function assemble(): { readonly payload: Inbox } | null { return { payload: { list: () => 1 } }; }',
    ].map((source) => ({
      mode: "types" as const,
      files: { ...API, [SERVICE]: source, "tests/server/domain/notifications/wrapped.int.test.ts": `import { assemble } from "${DOOR}"; assemble();` },
      expect: { count: 1, messageIncludes: "canonical service factory" },
      why: "an actual owned service carried inside returned data remains graph construction, regardless of property spelling or Promise/alias wrapping",
    })),
    {
      mode: "types",
      files: { ...API, "tests/server/domain/notifications/copy.int.test.ts": `import { assemble } from "${DOOR}"; let unstable = assemble; unstable();` },
      expect: { count: 1, messageIncludes: "cannot establish the invocation of a governed assembly constructor" },
      why: "a mutable alias refuses only because its initializer is independently proven to be a governed constructor; arbitrary unreadable calls are not constructors",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/entry/compose/services.ts":
          "export interface ServicesResult { readonly services: object } export async function createServices(): Promise<ServicesResult> { return { services: {} }; }",
        "packages/server/src/entry/compose/index.ts": 'export { createServices as assemble } from "./services.ts";',
        "tests/support/node/second-root.ts": 'import { assemble } from "../../../packages/server/src/entry/compose/index.ts"; assemble();',
      },
      expect: { count: 1, messageIncludes: SERVER_TEST_ASSEMBLY_HOME },
      why: "even delegation to genuine production composition is a second test root outside its single owning home; the promised return contract is resolved natively",
    },
    ...[
      `import { assemble as renamed } from "${DOOR}"; renamed();`,
      `import * as owner from "${DOOR}"; owner["assemble"]();`,
      `const { assemble: renamed } = await import("${DOOR}"); renamed();`,
      `import { assemble } from "${DOOR}"; const renamed = assemble; renamed.call(null);`,
      `import { assemble } from "${DOOR}"; const renamed = assemble; renamed.apply(null, []);`,
      `import { assemble } from "${DOOR}"; const bound = assemble.bind(null); bound();`,
    ].map((source) => ({
      mode: "types" as const,
      files: { ...API, "tests/server/domain/notifications/copy.int.test.ts": source },
      expect: { count: 1, messageIncludes: SERVER_TEST_ASSEMBLY_HOME },
      why: "canonical service origin and return contract survive renamed, namespace, dynamic and invocation-wrapper spellings",
    })),
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/server/src/entry/compose/services.ts": "export function createServices(): number { return 1; }",
        "tests/support/node/second-root.ts": 'import { createServices } from "../../../packages/server/src/entry/compose/services.ts"; createServices();',
      },
      expect: { messageIncludes: "test assembly return contract is unreadable" },
      why: "the exact known root constructor with an unreadable result cannot silently become an ungoverned arbitrary call",
    },
  ],
  mustPass: [
    ...[
      "export function assemble(): { readonly service: { readonly list: () => number } } { return { service: { list: () => 1 } }; }",
      'import type { Inbox } from "./contract/service.ts"; export function assemble(): { readonly load: () => Inbox } { return { load: () => ({ list: () => 1 }) }; }',
      'import type { Inbox } from "./contract/service.ts"; type Phantom<T> = { readonly stamp: number }; export function assemble(): Phantom<Inbox> { return { stamp: 1 }; }',
    ].map((source) => ({
      mode: "types" as const,
      files: { ...API, [SERVICE]: source, "tests/server/domain/notifications/wrapped.int.test.ts": `import { assemble } from "${DOOR}"; assemble();` },
      why: "lookalike fields, callable-only output and an erased generic argument do not carry the owned service value",
    })),
    {
      mode: "types",
      files: {
        ...API,
        "packages/server/src/domain/notifications/contract/results.ts": "export interface View { readonly list: () => number }",
        [SERVICE]: 'import type { View } from "./contract/results.ts"; export function assemble(): View { return { list: () => 1 }; }',
        "tests/server/domain/notifications/helper.int.test.ts": `import { assemble } from "${DOOR}"; assemble();`,
      },
      why: "matching method names and the same service filename do not turn a separately owned view contract into the service bundle",
    },
    {
      mode: "types",
      files: { "tests/support/node/raw-execution.ts": 'import { spawn } from "node:child_process"; export const execute = () => spawn("node", []);' },
      why: "a raw external subprocess adapter is not a domain service assembly",
    },
    {
      mode: "types",
      files: {
        ...API,
        "tests/server/domain/notifications/existing.int.test.ts":
          "declare const service: { list: () => number }; service.list(); declare const unknownCallback: () => void; unknownCallback();",
      },
      why: "using a graph-owned service and an opaque external callback constructs no service graph",
    },
    {
      mode: "types",
      files: {
        ...API,
        "tests/support/node/factories/notification.ts":
          'import type { Inbox } from "../../../../packages/server/src/domain/notifications/contract/service.ts"; export const seed = (record: Inbox["list"]) => record();',
      },
      why: "a production-derived builder invokes the supplied real operation rather than constructing a domain service",
    },
    {
      mode: "types",
      files: { ...API, [SERVER_TEST_ASSEMBLY_HOME]: 'import { assemble } from "../../../packages/server/src/domain/notifications/index.ts"; assemble();' },
      why: "the canonical Node root may invoke real production graph construction",
    },
    {
      mode: "types",
      files: { ...API, "tests/server/domain/notifications/builder.int.test.ts": "function assemble() { return { list: () => 1 }; } assemble();" },
      why: "a same-named local data builder is not the canonical production constructor",
    },
    {
      mode: "types",
      files: {
        ...API,
        [SERVICE]: "export function assemble(): number { return 1; }",
        "tests/server/domain/notifications/helper.int.test.ts": `import { assemble } from "${DOOR}"; assemble();`,
      },
      why: "a non-service result at the same source home is not graph assembly",
    },
  ],
});
