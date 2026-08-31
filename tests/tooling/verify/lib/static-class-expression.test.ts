// The static class-expression walker's contract: carrier discovery is declaration provenance, and the
// value evaluator keeps producer anchors across the local/cross-file expression shapes a class can ride.
import { ModuleKind, ModuleResolutionKind, Project, ScriptKind, SyntaxKind } from "ts-morph";
import {
  evaluateStaticClassExpression,
  evaluateStaticClassProperties,
  evaluateStaticObjectProperties,
  walkStaticClassExpressions,
} from "../../../../tooling/src/verify/lib/static-class-expression.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

function project(files: Readonly<Record<string, string>>): Project {
  const p = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext, jsx: 4 },
  });
  for (const [path, text] of Object.entries(files)) {
    p.createSourceFile(`${ROOT}/${path}`, text, { scriptKind: path.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS });
  }
  return p;
}

function valuesOf(p: Project): string[] {
  return walkStaticClassExpressions(p, p.getSourceFiles())
    .candidates.map((candidate) => candidate.value)
    .sort();
}

test("walks declaration-proven composers through aliases, namespaces, optional/bracket calls, wrappers, arrays, and clsx objects", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      import cxDefault, { clsx as join } from "clsx";
      import * as kit from "clsx";
      const local = join;
      const { clsx: destructured } = kit;
      const forward = (...args: Parameters<typeof join>) => local(...args) ?? "";
      function forwardFn(...args: Parameters<typeof join>) { return join(...args) ?? ""; }
      const forwardExpr = function (...args: Parameters<typeof join>) { return local(...args) ?? ""; };
      const branch = true ? "probe:conditional" : "hover:probe:alternate";
      const enabled = true;
      const spread = ["probe:array", { "probe:object-key": true }];
      export const A = <div className="probe:jsx" />;
      export const B = cxDefault?.("probe:default");
      export const C = local("probe:local", branch, [...spread], { enabled });
      export const D = forward("probe:forward");
      export const E = kit.clsx?.("probe:namespace-dot");
      export const F = kit["clsx"]?.("probe:namespace-bracket");
      export const G = destructured("probe:namespace-destructure");
      export const H = forwardFn("probe:forward-function");
      export const I = forwardExpr("probe:forward-expression");
    `,
  });

  expect(valuesOf(p)).toEqual(
    [
      "probe:array",
      "probe:conditional",
      "probe:default",
      "probe:forward",
      "probe:forward-expression",
      "probe:forward-function",
      "probe:jsx",
      "probe:local",
      "probe:namespace-bracket",
      "probe:namespace-destructure",
      "probe:namespace-dot",
      "probe:object-key",
      "enabled",
      "hover:probe:alternate",
    ].sort(),
  );
});

test("resolves a composer imported through a cross-file re-export alias", () => {
  const p = project({
    "packages/ui/src/composer.ts": 'export { clsx as join } from "clsx";\n',
    "packages/ui/src/x.ts": 'import { join as compose } from "./composer.ts";\nexport const x = compose("probe:reexported-composer");\n',
  });
  expect(valuesOf(p)).toEqual(["probe:reexported-composer"]);
});

test("keeps producer provenance through re-exports, templates, concatenation, and static/dynamic object indexing", () => {
  const producer = "packages/ui/src/classes.ts";
  const p = project({
    [producer]: `
      const tone = "card";
      export const DIRECT = "probe:bg-card";
      export const MAP = {
        exact: \`hover:probe:bg-\${tone}\`,
        other: "focus:" + "probe:text-foreground",
      } as const;
    `,
    "packages/ui/src/barrel.ts": 'export { DIRECT as REEXPORTED, MAP } from "./classes.ts";\n',
    "packages/client/src/consumer.tsx": `
      import { MAP, REEXPORTED } from "../../ui/src/barrel.ts";
      declare const key: keyof typeof MAP;
      export const A = <div className={REEXPORTED} />;
      export const B = <div className={MAP.exact} />;
      export const C = <div className={MAP["other"]} />;
      export const D = <div className={MAP[key]} />;
    `,
  });

  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value).sort()).toEqual(["focus:probe:text-foreground", "hover:probe:bg-card", "probe:bg-card"].sort());
  expect(new Set(result.candidates.map((candidate) => candidate.segments[0]?.node.getSourceFile().getFilePath()))).toEqual(new Set([`${ROOT}/${producer}`]));
});

test("resolves a default-imported class value at its producer", () => {
  const p = project({
    "packages/ui/src/default-class.ts": 'export default "probe:default-export";\n',
    "packages/ui/src/x.tsx": 'import className from "./default-class.ts";\nexport const x = <div className={className} />;\n',
  });
  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value)).toEqual(["probe:default-export"]);
  expect(result.candidates[0]?.segments[0]?.node.getSourceFile().getFilePath()).toBe(`${ROOT}/packages/ui/src/default-class.ts`);
});

test("traverses tv/cva class-bearing config fields without treating selectors, defaults, or slot names as classes", () => {
  const p = project({
    "packages/ui/src/variants.ts": `
      import { tv as variants } from "tailwind-variants";
      import { cva } from "class-variance-authority";
      export const a = variants({
        base: "probe:base",
        slots: { root: "probe:slot" },
        variants: { tone: { loud: { root: "hover:probe:variant-slot" }, quiet: "probe:variant" } },
        compoundVariants: [{ tone: "probe:not-a-class", class: "probe:compound" }],
        defaultVariants: { tone: "probe:not-a-class-either" },
      });
      export const b = cva("probe:cva-base", {
        variants: { intent: { loud: ["probe:cva-variant"] } },
        compoundVariants: [{ intent: "probe:not-selector", className: "probe:cva-compound" }],
        defaultVariants: { intent: "probe:not-default" },
      });
    `,
  });

  expect(valuesOf(p)).toEqual(
    [
      "hover:probe:variant-slot",
      "probe:base",
      "probe:compound",
      "probe:cva-base",
      "probe:cva-compound",
      "probe:cva-variant",
      "probe:slot",
      "probe:variant",
    ].sort(),
  );
});

test("counts opaque runtime leaves and fails loud on a static cycle while retaining a runtime prefix", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      declare const tone: string;
      const A = B;
      const B = A;
      export const X = <div className={A} />;
      export const Y = <div className={\`probe:\${tone}\`} />;
      export const Z = <div className={runtimeClass()} />;
      declare function runtimeClass(): string;
    `,
  });

  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.unresolved.some((shape) => shape.reason.includes("cycle"))).toBe(true);
  expect(result.opaque.length).toBeGreaterThan(0);
  expect(result.runtimePrefixes.map((prefix) => prefix.prefix)).toContain("probe:");
});

test("does not grant composer identity to an arbitrary local function named cn", () => {
  const p = project({
    "packages/ui/src/x.ts": 'function cn(value: string) { return value.length; }\nexport const inert = cn("probe:not-a-class");\n',
  });
  expect(valuesOf(p)).toEqual([]);
});

test("counts runtime composer arguments opaque without manufacturing a static cycle", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      import { clsx } from "clsx";
      export function X({ className }: { className?: string }) {
        return <div className={clsx("probe:literal", className)} />;
      }
    `,
  });
  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value)).toEqual(["probe:literal"]);
  expect(result.unresolved).toEqual([]);
  expect(result.opaque.some((shape) => shape.reason.includes("callsite"))).toBe(true);
});

test("deduplicates repeated values while retaining every carrier consumer", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      const SHARED = "probe:shared";
      export const A = <div className={[SHARED, SHARED]} />;
      export const B = <div className={SHARED} />;
      export const prose = "probe:inert prose";
      export const token = "--surface-tone";
      // probe:comment is not a carrier
    `,
  });
  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]?.value).toBe("probe:shared");
  expect(result.candidates[0]?.consumers).toHaveLength(2);
  expect(result.unresolved).toEqual([]);
});

test("evaluates a supplied terminal and a JSX spread object's class fields without admitting inert siblings", () => {
  const p = project({
    "packages/ui/src/producer.ts": `
      export const SHARED = "probe:shared";
      const nested = { className: "probe:nested", title: "probe:not-a-class" };
      export const PROPS = { class: "probe:svg", className: SHARED, copy: "probe:prose", ...nested };
    `,
    "packages/client/src/x.tsx": `
      import { PROPS, SHARED } from "../../ui/src/producer.ts";
      declare const list: { add(...values: string[]): void };
      list.add(...["probe:spread-arg", SHARED]);
      export const X = <div {...PROPS} />;
      const inert = { className: "probe:unqueried" };
    `,
  });
  const consumerFile = p.getSourceFileOrThrow(`${ROOT}/packages/client/src/x.tsx`);
  const call = consumerFile.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText() === "list.add");
  if (call === undefined) {
    throw new Error("test fixture lost list.add call");
  }
  const spread = call.getArguments()[0];
  if (spread === undefined) {
    throw new Error("test fixture lost spread argument");
  }
  const terminal = evaluateStaticClassExpression(spread, call);
  expect(terminal.candidates.map((candidate) => candidate.value).sort()).toEqual(["probe:shared", "probe:spread-arg"]);
  expect(terminal.candidates.every((candidate) => candidate.consumers[0] === call)).toBe(true);

  const jsxSpread = consumerFile.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute)[0];
  if (jsxSpread === undefined) {
    throw new Error("test fixture lost JSX spread");
  }
  const properties = evaluateStaticClassProperties(jsxSpread.getExpression(), jsxSpread);
  expect(properties.candidates.map((candidate) => candidate.value).sort()).toEqual(["probe:nested", "probe:svg"]);
  expect(properties.candidates.every((candidate) => candidate.consumers[0] === jsxSpread)).toBe(true);
  expect(properties.unresolved).toEqual([]);
});

test("reports mutable carrier bindings unresolved rather than guessing an initializer", () => {
  const p = project({
    "packages/ui/src/x.tsx": 'let mutable = "probe:first";\nmutable = "probe:second";\nexport const X = <div className={mutable} />;\n',
  });
  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.candidates).toEqual([]);
  expect(result.unresolved.map((shape) => shape.reason)).toContain("mutable class binding");
});

test("binds imported JSX component attributes to renamed destructured parameters", () => {
  const p = project({
    "packages/ui/src/component.tsx": `
      export function Button({ marker: className }: { marker?: string }) {
        return <button className={className === undefined ? "button-base" : \`button-base \${className}\`} />;
      }
    `,
    "packages/client/src/x.tsx": `
      import { Button as Control } from "../../ui/src/component.tsx";
      export const X = <Control marker="probe:callsite" />;
    `,
  });
  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value).sort()).toEqual(["button-base", "button-base probe:callsite"]);
  expect(result.unresolved).toEqual([]);
});

test("fails loud on a recursive JSX prop binding", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      export function Recursive({ marker }: { marker?: string }) {
        return <><Recursive marker={marker} /><div className={marker} /></>;
      }
    `,
  });
  const result = walkStaticClassExpressions(p, p.getSourceFiles());
  expect(result.unresolved.map((shape) => shape.reason)).toContain("static JSX component-prop cycle");
});

test("resolves exact spread properties through aliases and re-exports with overwrite order and honest unknowns", () => {
  const p = project({
    "packages/ui/src/props.ts": `
      const KEY = "className";
      const base = { className: "probe:first", role: "button" };
      const props = { ...base, [KEY]: "probe:last", dataProbe: "yes" };
      export { props as PROPS };
    `,
    "packages/ui/src/barrel.ts": 'export { PROPS as CONTROL_PROPS } from "./props.ts";\n',
    "packages/client/src/x.tsx": `
      import { CONTROL_PROPS } from "../../ui/src/barrel.ts";
      declare const key: string;
      declare const runtime: Record<string, string>;
      const unknown = { [key]: "probe:unknown" };
      export const A = <div {...CONTROL_PROPS} />;
      export const B = <div {...unknown} />;
      export const C = <div {...runtime} />;
    `,
  });
  const consumer = p.getSourceFileOrThrow(`${ROOT}/packages/client/src/x.tsx`);
  const spreads = consumer.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute);
  const exactSpread = spreads[0];
  const unresolvedSpread = spreads[1];
  const opaqueSpread = spreads[2];
  if (exactSpread === undefined || unresolvedSpread === undefined || opaqueSpread === undefined) {
    throw new Error("test fixture lost one of its JSX spreads");
  }
  const exact = evaluateStaticObjectProperties(exactSpread.getExpression(), exactSpread, ["className", "dataProbe"]);
  expect(exact.properties.map((property) => [property.name, property.value.getText()])).toEqual([
    ["className", '"probe:last"'],
    ["dataProbe", '"yes"'],
  ]);
  expect(exact.properties.every((property) => property.consumer === exactSpread)).toBe(true);
  expect(exact.unresolved).toEqual([]);
  expect(evaluateStaticObjectProperties(unresolvedSpread.getExpression(), unresolvedSpread, ["className"]).unresolved).not.toEqual([]);
  expect(evaluateStaticObjectProperties(opaqueSpread.getExpression(), opaqueSpread, ["className"]).opaque).not.toEqual([]);
});
