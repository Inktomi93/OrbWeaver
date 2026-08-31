// Integration proof for #954: exact candidates come from AST/declaration provenance first; Oxide only
// tokenizes those candidates, and cross-file producer/consumer changes force whole-project deferral.
import { ModuleKind, ModuleResolutionKind, Project, ScriptKind } from "ts-morph";
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePassResult } from "../../../../tooling/src/verify/contract/pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import type { GateRunCtx, Scope } from "../../../../tooling/src/verify/index.ts";
import { runPass, runScopedPass } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

function baseFor(files: Readonly<Record<string, string>>): Omit<GateRunCtx, "report" | "scan"> {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext, jsx: 4 },
  });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text, { scriptKind: path.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS });
  }
  return { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() };
}

function passFor(files: Readonly<Record<string, string>>): GatePassResult {
  const result = runPass([gate], baseFor(files));
  expect(result.toolErrors).toEqual([]);
  const pass = result.gates[0];
  expect(pass).toBeDefined();
  return pass as GatePassResult;
}

function findings(files: Readonly<Record<string, string>>): readonly Finding[] {
  return passFor(files).findings;
}

test("Oxide candidates are checked for an exact top-level dark segment across bracket/paren nesting", () => {
  const got = findings({
    "packages/ui/src/x.tsx": `
      export const A = <div className="[&:where(.x:y)]:dark:bg-card supports-[selector(:has(*))]:dark:text-foreground" />;
      export const B = <div className="[&_.dark:x]:bg-card darkroom:bg-card" />;
    `,
  });
  expect(got.map((finding) => finding.token)).toEqual(["[&:where(.x:y)]:dark:bg-card", "supports-[selector(:has(*))]:dark:text-foreground"]);
});

test("runtime-assembled dark prefix is a separate finding and unresolved static cycles fail loud", () => {
  const pass = passFor({
    "packages/ui/src/x.tsx": `
      declare const tone: string;
      const A = B;
      const B = A;
      export const X = <div className={\`dark:\${tone}\`} />;
      export const Y = <div className={A} />;
    `,
  });
  const got = pass.findings;
  // Oxide emits no complete candidate for this partial string; the dedicated AST-prefix arm owns `dark:`.
  expect(got.some((finding) => finding.token === "dark:")).toBe(true);
  expect(got.some((finding) => finding.token?.startsWith("unresolved:") === true)).toBe(true);
  expect(pass.scan.declared?.skipReasons).toMatchObject({ unresolved: 1, "opaque-runtime": 1 });
});

test("a cross-file re-exported class is reported at its producer, not its JSX consumer", () => {
  const got = findings({
    "packages/ui/src/producer.ts": 'export const CARD = "dark:bg-card";\n',
    "packages/ui/src/barrel.ts": 'export { CARD as SURFACE } from "./producer.ts";\n',
    "packages/client/src/consumer.tsx": 'import { SURFACE } from "../../ui/src/barrel.ts";\nexport const X = <div className={SURFACE} />;\n',
  });
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ file: "packages/ui/src/producer.ts", line: 1, token: "dark:bg-card" });
});

test("producer-only and consumer-only scoped runs both defer the whole-project gate", () => {
  const base = baseFor({
    "packages/ui/src/producer.ts": 'export const CARD = "dark:bg-card";\n',
    "packages/client/src/consumer.tsx": 'import { CARD } from "../../ui/src/producer.ts";\nexport const X = <div className={CARD} />;\n',
  });
  for (const path of ["packages/ui/src/producer.ts", "packages/client/src/consumer.tsx"]) {
    const scope: Scope = { kind: "changed", paths: [path] };
    const scoped = runScopedPass([gate], base, { scope, inScope: (candidate) => candidate === path });
    expect(scoped.deferred.map((deferred) => deferred.name)).toEqual(["no-tailwind-dark-variant"]);
    expect(scoped.pass.gates).toEqual([]);
  }
});
