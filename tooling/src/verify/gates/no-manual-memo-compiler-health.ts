// Policy: no-manual-memo-compiler-health — the virtualized UI grants end when React Compiler stops
// denylisting @tanstack/react-virtual. The installed bundle comes through the closed ResourceHost door.
//
// FAMILY: a declared SINGLETON since #0038 (it was filed under `react-origin`). That family's shared reader is
// `lib/react-origin.ts` — the canonical identity of a React export at a call or import site. This policy reads
// no source file: its subject is a token in the installed React Compiler bundle, the end condition the two
// `no-manual-memo` reviewed grants name in their `endsWhen`. No React-export reader can answer that question.
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SELF = "tooling/src/verify/gates/no-manual-memo-compiler-health.ts";
const TOKEN = "@tanstack/react-virtual";
const REQUEST = { kind: "installed-package", id: "react-compiler", mode: "text", file: "dist/index.js" } as const;
const MESSAGE =
  "the installed React Compiler no longer denylists @tanstack/react-virtual; retire the message-list and media-grid manual memo grants and delete their now-redundant memoization. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const HEALTH_SOURCE = "export const compilerHealthProof = true;\n";
const CLIENT_PACKAGE = '{"name":"@orb/client","private":true,"dependencies":{"babel-plugin-react-compiler":"1.0.0"}}\n';
const COMPILER_PACKAGE = '{"name":"babel-plugin-react-compiler","version":"1.0.0"}\n';

export const gate = defineGate({
  id: "no-manual-memo-compiler-health",
  family: "no-manual-memo-compiler-health",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: [SELF] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [REQUEST],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: (): void => {
      const compiler = readyResourceValue(ctx.resources.installedPackage(REQUEST));
      if (compiler.mode !== "text") {
        throw new Error("react-compiler text request returned a different installed-package mode");
      }
      if (!compiler.text.includes(TOKEN)) {
        ctx.report.file(SELF, { line: 1, column: 1, token: "react-compiler" });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        [SELF]: HEALTH_SOURCE,
        "packages/client/package.json": CLIENT_PACKAGE,
        "packages/client/node_modules/babel-plugin-react-compiler/package.json": COMPILER_PACKAGE,
        "packages/client/node_modules/babel-plugin-react-compiler/dist/index.js": "export const compiler = true;\n",
      },
      expect: { count: 1, token: "react-compiler" },
      why: "the installed compiler bundle dropped the denylist token, consuming the two grant end conditions",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        [SELF]: HEALTH_SOURCE,
        "packages/client/package.json": CLIENT_PACKAGE,
        "packages/client/node_modules/babel-plugin-react-compiler/package.json": COMPILER_PACKAGE,
        "packages/client/node_modules/babel-plugin-react-compiler/dist/index.js": 'const denylist = "@tanstack/react-virtual";\n',
      },
      why: "the installed compiler still names the incompatible virtualizer package",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        [SELF]: HEALTH_SOURCE,
        "packages/client/package.json": CLIENT_PACKAGE,
        "packages/client/node_modules/babel-plugin-react-compiler/package.json": "{",
      },
      expect: { messageIncludes: "react-compiler" },
      why: "a malformed installed compiler manifest cannot establish the grant end condition and refuses loudly",
    },
  ],
});
