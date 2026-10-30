// `orb/derived-port-member` refuses a port member whose hand-written function type is identical to the member flowing
// into it, names the higher-tier member as the restatement, and sends a cross-domain pair to packages/contracts.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { derivedPortMemberRule } from "../../tooling/src/eslint/derived-port.ts";

const RULE = "orb/derived-port-member";
const SERVICE = "packages/server/src/domain/sessions/contract/service.ts";
const CLOCK = "packages/kit/src/time/index.ts";
const SITE = "packages/server/src/entry/compose/probe.ts";
const CROSS = "packages/server/src/domain/admin/contract/probe.ts";

const OWNERS = {
  [SERVICE]: [
    "export interface SessionsService {",
    "  create: (userId: string) => Promise<{ token: string; expiresAt: number }>;",
    "  revoke: (token: string) => Promise<void>;",
    "  onSettled: () => void;",
    "}",
    "export declare const sessions: SessionsService;",
  ].join("\n"),
  [CLOCK]: "export type Clock = () => number;\nexport interface Seams { readonly now: Clock; }\nexport declare const seams: Seams;",
};

const IMPORTS =
  'import { sessions } from "../../domain/sessions/contract/service.ts";\nimport type { SessionsService } from "../../domain/sessions/contract/service.ts";\nimport { seams } from "../../../../kit/src/time/index.ts";';

function lint(root: string, file: string, source: string): readonly Linter.LintMessage[] {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: [...Object.keys(OWNERS), file].map((path) => join(root, path)), options });
  const found = new Linter({ cwd: root }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "derived-port-member": derivedPortMemberRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, file) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

test.for([
  {
    name: "a whole port restated by hand",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly create: (userId: string) => Promise<{ token: string; expiresAt: number }>; }\nexport const deps: { sessions: Port } = { sessions };`,
    findings: ["Port.create hand-restates SessionsService.create"],
  },
  {
    name: "a member forwarded through a lambda",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { revoke(token: string): Promise<void>; }\nexport const port: Port = { revoke: (token) => sessions.revoke(token) };`,
    findings: ["Port.revoke hand-restates SessionsService.revoke"],
  },
  {
    name: "a clock restated beside the named kit type",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly now: () => number; }\nexport const port: Port = seams;`,
    findings: ["Port.now hand-restates Seams.now"],
  },
  {
    name: "a port in one domain restating another domain's member",
    file: CROSS,
    source:
      'import { sessions } from "../../sessions/contract/service.ts";\ninterface Port { readonly revoke: (token: string) => Promise<void>; }\nexport const port: Port = sessions;',
    findings: ["move the shape to packages/contracts"],
  },
  {
    name: "a port derived from its owner",
    file: SITE,
    source: `${IMPORTS}\ntype Port = Pick<SessionsService, "create" | "revoke">;\nexport const port: Port = sessions;`,
    findings: [],
  },
  {
    name: "a member derived by index",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly revoke: SessionsService["revoke"]; }\nexport const port: Port = { revoke: (token) => sessions.revoke(token) };`,
    findings: [],
  },
  {
    name: "a concept-free notification callback",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly onSettled: () => void; }\nexport const port: Port = sessions;`,
    findings: [],
  },
  {
    name: "a port that narrows the return on purpose",
    file: SITE,
    source: `${IMPORTS}\ninterface Port { readonly create: (userId: string) => Promise<{ token: string }>; }\nexport const port: Port = sessions;`,
    findings: [],
  },
] as const)("derived-port-member judges $name", async ({ file, source, findings }, { plantedTree }) => {
  const root = await plantedTree({ ...OWNERS, [file]: source });
  const messages = lint(root, file, source).map(({ message }) => message);
  expect(messages).toHaveLength(findings.length);
  for (const [index, expected] of findings.entries()) {
    expect(messages[index]).toContain(expected);
  }
});
