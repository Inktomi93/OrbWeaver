// `pnpm unwired ports` plans each restating member: derive through the owner's door, a kit type for a concept,
// a contracts move across domains, a hand note where a derive would close an import cycle.
import { expect, test } from "@orb/testkit/tooling";
import { portCensus } from "../../../tooling/src/unwired/index.ts";

const SERVER = "packages/server/src";

const TREE = {
  "packages/server/tsconfig.json": JSON.stringify({
    compilerOptions: {
      strict: true,
      target: "ESNext",
      lib: ["ESNext"],
      module: "ESNext",
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      noEmit: true,
      types: [],
      paths: { "#*": ["./src/*/index.ts"] },
    },
    include: ["src"],
  }),
  [`${SERVER}/domain/sessions/contract/service.ts`]: [
    "export interface SessionsService {",
    "  revoke: (token: string) => Promise<void>;",
    "  lookup: (id: string) => Promise<string | null>;",
    "}",
    "export interface SessionsContext {",
    "  now: () => number;",
    "}",
  ].join("\n"),
  [`${SERVER}/domain/sessions/index.ts`]:
    'export type { SessionsService } from "./contract/service.ts";\nexport declare const sessions: import("./contract/service.ts").SessionsService;',
  [`${SERVER}/domain/admin/contract/ops.ts`]: "export interface AdminSessionOps {\n  revoke: (token: string) => Promise<void>;\n}",
  [`${SERVER}/domain/admin/index.ts`]: 'export type { AdminSessionOps } from "./contract/ops.ts";',
  [`${SERVER}/domain/admin/verbs/kick.ts`]: 'import type { SessionsService } from "#domain/sessions";\nexport type Kick = SessionsService["revoke"];',
  [`${SERVER}/entry/http/routes.ts`]: [
    'import { sessions } from "#domain/sessions";',
    'import type { AdminSessionOps } from "#domain/admin";',
    "export interface RoutePort {",
    "  readonly lookup: (id: string) => Promise<string | null>;",
    "  readonly now: () => number;",
    "}",
    "export const port: RoutePort = { lookup: sessions.lookup, now: () => 0 };",
    "export const admin: AdminSessionOps = sessions;",
  ].join("\n"),
};

test("the port census plans derive, concept, cross-domain and import targets", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const { targets } = portCensus(root, () => undefined);
  const plan = targets.map(({ kind, form, file, members, type, imports, exports }) => ({ kind, form, file, members, type, imports, exports }));
  expect(plan).toEqual(
    expect.arrayContaining([
      {
        kind: "derive",
        form: "member",
        file: `${SERVER}/entry/http/routes.ts`,
        members: ["lookup"],
        type: 'SessionsService["lookup"]',
        imports: [{ name: "SessionsService", from: "#domain/sessions" }],
        exports: [],
      },
      {
        kind: "concept",
        form: "member",
        file: `${SERVER}/entry/http/routes.ts`,
        members: ["now"],
        type: "Clock",
        imports: [{ name: "Clock", from: "@orb/kit/time" }],
        exports: [],
      },
      {
        kind: "move-to-contracts",
        form: "member",
        file: `${SERVER}/domain/admin/contract/ops.ts`,
        members: ["revoke"],
        type: null,
        imports: [],
        exports: [],
      },
      {
        kind: "move-to-contracts",
        form: "import",
        file: `${SERVER}/domain/admin/verbs/kick.ts`,
        members: ["SessionsService"],
        type: null,
        imports: [],
        exports: [],
      },
    ]),
  );
});
