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
  return walkStaticClassExpressions(p.getSourceFiles())
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

test("resolves workspace package aliases only to admitted source files", () => {
  const sharedExpression = ["$", "{SHARED}"].join("");
  const p = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      module: ModuleKind.NodeNext,
      moduleResolution: ModuleResolutionKind.NodeNext,
      jsx: 4,
      baseUrl: ROOT,
      paths: { "@orb/ui/lib": ["packages/ui/src/lib/index.ts"] },
    },
  });
  p.createSourceFile(`${ROOT}/packages/ui/src/lib/classes.ts`, 'export const SHARED = "probe:workspace-alias";\n');
  p.createSourceFile(`${ROOT}/packages/ui/src/lib/index.ts`, 'export { SHARED } from "./classes.ts";\n');
  p.createSourceFile(
    `${ROOT}/packages/client/src/x.tsx`,
    `import { SHARED } from "@orb/ui/lib";\nexport const X = <div className={\`${sharedExpression} probe:after-alias\`} />;\n`,
    { scriptKind: ScriptKind.TSX },
  );

  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value)).toEqual(["probe:workspace-alias probe:after-alias"]);
  expect(result.opaque).toEqual([]);
});

test("resolves a composer through namespace access on a local re-export module", () => {
  const p = project({
    "packages/ui/src/composer.ts": 'export { clsx as join } from "clsx";\n',
    "packages/ui/src/x.ts": `
      import * as composer from "./composer.ts";
      export const dot = composer.join("probe:namespace-reexport-dot");
      export const bracket = composer["join"]("probe:namespace-reexport-bracket");
    `,
  });
  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value).sort()).toEqual(["probe:namespace-reexport-bracket", "probe:namespace-reexport-dot"]);
  expect(result.opaque).toEqual([]);
  expect(result.unresolved).toEqual([]);
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

  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value).sort()).toEqual(["focus:probe:text-foreground", "hover:probe:bg-card", "probe:bg-card"].sort());
  expect(new Set(result.candidates.map((candidate) => candidate.segments[0]?.node.getSourceFile().getFilePath()))).toEqual(new Set([`${ROOT}/${producer}`]));
});

test("resolves a default-imported class value at its producer", () => {
  const p = project({
    "packages/ui/src/default-class.ts": 'export default "probe:default-export";\n',
    "packages/ui/src/x.tsx": 'import className from "./default-class.ts";\nexport const x = <div className={className} />;\n',
  });
  const result = walkStaticClassExpressions(p.getSourceFiles());
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

test("carries declaration-proven tv configuration through direct, aliased, re-exported, and slot-member calls", () => {
  const p = project({
    "packages/ui/src/variants.ts": `
      import { tv as makeVariants } from "tailwind-variants";
      const recipe = makeVariants({
        base: "probe:base",
        slots: { root: "probe:root", icon: "probe:icon" },
        variants: { tone: { loud: { root: "probe:loud" }, quiet: { root: "probe:quiet" } } },
        compoundVariants: [{ tone: "loud", class: "probe:compound" }],
        defaultVariants: { tone: "probe:not-a-class" },
      });
      export { recipe as controlVariants };
      export const local = recipe({ tone: "loud" });
    `,
    "packages/ui/src/index.ts": 'export { controlVariants as CONTROL } from "./variants.ts";\n',
    "packages/ui/src/consumer.ts": `
      import { CONTROL as direct } from "./index.ts";
      const alias = direct;
      const slots = direct({ tone: "loud" });
      export const a = direct({ tone: "quiet" });
      export const b = alias();
      export const c = slots.root();
      export const d = direct().icon();
    `,
  });
  const calls = new Map(p.getSourceFiles().flatMap((source) => source.getDescendantsOfKind(SyntaxKind.CallExpression).map((call) => [call.getText(), call])));
  const expected = ["probe:base", "probe:compound", "probe:icon", "probe:loud", "probe:quiet", "probe:root"].sort();
  const provenCalls = ['recipe({ tone: "loud" })', 'direct({ tone: "quiet" })', "alias()", "slots.root()", "direct().icon()"] as const;
  for (const text of provenCalls) {
    const call = calls.get(text);
    if (call === undefined) {
      throw new Error(`test fixture lost ${text}`);
    }
    const result = evaluateStaticClassExpression(p.getSourceFiles(), call, call);
    expect(result.candidates.map((candidate) => candidate.value).sort(), text).toEqual(expected);
    expect(result.opaque, text).toEqual([]);
    expect(result.unresolved, text).toEqual([]);
  }
  const walked = walkStaticClassExpressions(p.getSourceFiles());
  const consumers = walked.candidates.find((candidate) => candidate.value === "probe:base")?.consumers.map((consumer) => consumer.getText()) ?? [];
  expect(consumers).toEqual(expect.arrayContaining([...provenCalls]));
});

test("keeps counterfeit and runtime-configured variant calls opaque", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      function tv(_config: unknown) { return () => "probe:counterfeit"; }
      declare const runtime: Record<string, unknown>;
      const counterfeit = tv({ base: "probe:not-proven" });
      import { tv as realTv } from "tailwind-variants";
      const dynamic = realTv(runtime);
      const spread = realTv({ base: "probe:known", ...runtime });
      export const A = <div className={counterfeit()} />;
      export const B = <div className={dynamic()} />;
      export const C = <div className={spread()} />;
    `,
  });
  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value)).toEqual(["probe:known"]);
  expect(result.opaque.map((shape) => shape.reason)).toEqual(
    expect.arrayContaining(["runtime call result", "runtime variant configuration", "runtime object spread in variant configuration"]),
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

  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.unresolved.some((shape) => shape.reason.includes("cycle"))).toBe(true);
  expect(result.opaque.length).toBeGreaterThan(0);
  expect(result.runtimePrefixes.map((prefix) => prefix.prefix)).toContain("probe:");
});

test("models all zero-argument string trims across literal unions while preserving offsets and honest runtime prefixes", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      declare const tail: string | undefined;
      declare const chooseUnionA: boolean;
      const union: "  probe:union-a  " | "  probe:union-b  " = chooseUnionA ? "  probe:union-a  " : "  probe:union-b  ";
      export const Static = <div className={"  probe:trimmed  ".trim()} />;
      export const Start = <div className={"  probe:start  ".trimStart()} />;
      export const End = <div className={"  probe:end  ".trimEnd()} />;
      export const Union = <div className={union.trim()} />;
      export const Mixed = <div className={\`  probe:prefix \${tail ?? ""}\`.trim()} />;
      export const MixedEnd = <div className={\`probe:end-prefix \${tail ?? ""}\`.trimEnd()} />;
      export const RuntimeFirst = <div className={\`\${tail ?? ""} probe:tail\`.trimStart()} />;
    `,
  });

  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value)).toEqual(
    expect.arrayContaining(["probe:trimmed", "probe:start  ", "  probe:end", "probe:union-a", "probe:union-b"]),
  );
  expect(result.runtimePrefixes.map((prefix) => prefix.prefix)).toContain("probe:prefix ");
  expect(result.runtimePrefixes.map((prefix) => prefix.prefix)).toContain("probe:end-prefix ");
  expect(result.runtimePrefixes.map((prefix) => prefix.prefix)).not.toContain(" probe:tail");
  const source = p.getSourceFileOrThrow(`${ROOT}/packages/ui/src/x.tsx`).getFullText();
  const trimmed = result.candidates.find((candidate) => candidate.value === "probe:trimmed");
  expect(trimmed?.segments).toHaveLength(1);
  expect(source.slice(trimmed?.segments[0]?.sourceStart, (trimmed?.segments[0]?.sourceStart ?? 0) + "probe:trimmed".length)).toBe("probe:trimmed");
});

test("does not grant class provenance to an unrelated method named trim", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      const custom = { trim: () => "probe:not-a-class" };
      export const inert = custom.trim();
    `,
  });
  expect(valuesOf(p)).toEqual([]);
});

test("does not model string trim calls with arguments or receivers whose union contains a non-string", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      declare const mixed: string | { trim(): string };
      export const Argument = <div className={"probe:argument".trim("probe:not-zero-arg")} />;
      export const Mixed = <div className={mixed.trim()} />;
    `,
  });
  expect(valuesOf(p)).toEqual([]);
});

test("collects createLucideIcon IconNode className writers only through the exact lucide-react terminal", () => {
  const p = project({
    "packages/ui/src/icons.ts": `
      import { createLucideIcon as makeIcon } from "lucide-react";
      import * as Lucide from "lucide-react";
      const base = [["path", { className: "orb:base", title: "orb:not-title" }], ["orb:not-tuple-attrs", { className: "orb:second" }, { className: "orb:not-index-two" }]] as const;
      const nodes = base;
      nodes.push(["circle", { className: "orb:pushed" }]);
      export const A = makeIcon("orb:not-name", nodes);
      export const B = Lucide["createLucideIcon"]("B", [["path", { className: "orb:namespace" }]]);
    `,
  });
  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value).sort()).toEqual(["orb:base", "orb:namespace", "orb:pushed", "orb:second"]);
  expect(result.unresolved).toEqual([]);
  expect(result.opaque).toEqual([]);
});

test("keeps counterfeit factories and uncertain lucide IconNode mutations opaque", () => {
  const cases = [
    'import { createLucideIcon } from "other"; createLucideIcon("X", [["path", { className: "orb:counterfeit" }]]);',
    'import { createLucideIcon } from "lucide-react"; declare const runtime: unknown[]; const nodes = [["path", { className: "orb:spread-stale" }], ...runtime]; createLucideIcon("X", nodes);',
    'import { createLucideIcon } from "lucide-react"; const nodes = [["path", { className: "orb:index-stale" }]]; nodes[0] = ["circle", { className: "orb:index-new" }]; createLucideIcon("X", nodes);',
    'import { createLucideIcon } from "lucide-react"; const nodes = [["path", { className: "orb:alias-stale" }]]; consume(nodes); createLucideIcon("X", nodes); declare function consume(value: unknown): void;',
    'import { createLucideIcon } from "lucide-react"; let nodes = [["path", { className: "orb:reassigned" }]]; createLucideIcon("X", nodes);',
  ];
  for (const [index, source] of cases.entries()) {
    const p = project({ [`packages/ui/src/case-${index}.ts`]: source });
    const result = walkStaticClassExpressions(p.getSourceFiles());
    expect(result.candidates, `case ${index}`).toEqual([]);
    expect(Math.min([...result.opaque, ...result.unresolved].length, 1), `case ${index}`).toBe(index === 0 ? 0 : 1);
  }
});

test("does not grant composer identity to an arbitrary local function named cn", () => {
  const p = project({
    "packages/ui/src/x.ts": 'function cn(value: string) { return value.length; }\nexport const inert = cn("probe:not-a-class");\n',
  });
  expect(valuesOf(p)).toEqual([]);
});

test("does not grant composer identity when a wrapper returns unrelated prose", () => {
  const p = project({
    "packages/ui/src/x.ts": `
      import { clsx } from "clsx";
      function notAComposer(value: string) {
        clsx(value);
        return "fixed prose";
      }
      export const inert = notAComposer("probe:not-a-class");
    `,
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
  const result = walkStaticClassExpressions(p.getSourceFiles());
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
  const result = walkStaticClassExpressions(p.getSourceFiles());
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
  const terminal = evaluateStaticClassExpression(p.getSourceFiles(), spread, call);
  expect(terminal.candidates.map((candidate) => candidate.value).sort()).toEqual(["probe:shared", "probe:spread-arg"]);
  expect(terminal.candidates.every((candidate) => candidate.consumers[0] === call)).toBe(true);

  const jsxSpread = consumerFile.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute)[0];
  if (jsxSpread === undefined) {
    throw new Error("test fixture lost JSX spread");
  }
  const properties = evaluateStaticClassProperties(p.getSourceFiles(), jsxSpread.getExpression(), jsxSpread);
  expect(properties.candidates.map((candidate) => candidate.value).sort()).toEqual(["probe:nested", "probe:svg"]);
  expect(properties.candidates.every((candidate) => candidate.consumers[0] === jsxSpread)).toBe(true);
  expect(properties.unresolved).toEqual([]);
});

test("reports mutable carrier bindings unresolved rather than guessing an initializer", () => {
  const p = project({
    "packages/ui/src/x.tsx": 'let mutable = "probe:first";\nmutable = "probe:second";\nexport const X = <div className={mutable} />;\n',
  });
  const result = walkStaticClassExpressions(p.getSourceFiles());
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
  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates.map((candidate) => candidate.value).sort()).toEqual(["button-base", "button-base probe:callsite"]);
  expect(result.unresolved).toEqual([]);
});

test("standalone evaluation preindexes forwarding wrappers and cross-file JSX bindings", () => {
  const p = project({
    "packages/ui/src/component.tsx": `
      import { clsx } from "clsx";
      export const forward = (value: string) => clsx(value);
      export function Child({ marker: renamed }: { marker: string }) { return <div className={clsx("probe:base", renamed)} />; }
    `,
    "packages/client/src/x.tsx": `
      import { Child, forward } from "../../ui/src/component.tsx";
      export const A = <div className={forward("probe:forwarded")} />;
      export const B = <Child marker="probe:callsite" />;
    `,
  });
  const files = p.getSourceFiles();
  const wrapperCall = p
    .getSourceFileOrThrow(`${ROOT}/packages/client/src/x.tsx`)
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getText().startsWith("forward("));
  const childClass = p
    .getSourceFileOrThrow(`${ROOT}/packages/ui/src/component.tsx`)
    .getDescendantsOfKind(SyntaxKind.JsxAttribute)
    .find((attribute) => attribute.getNameNode().getText() === "className");
  const childExpression = childClass?.getInitializer()?.asKind(SyntaxKind.JsxExpression)?.getExpression();
  if (wrapperCall === undefined || childClass === undefined || childExpression === undefined) {
    throw new Error("standalone preindex fixture lost a class expression");
  }
  expect(evaluateStaticClassExpression(files, wrapperCall, wrapperCall).candidates.map(({ value }) => value)).toEqual(["probe:forwarded"]);
  expect(
    evaluateStaticClassExpression(files, childExpression, childClass)
      .candidates.map(({ value }) => value)
      .sort(),
  ).toEqual(["probe:base", "probe:callsite"].sort());
});

test("fails loud on a recursive JSX prop binding", () => {
  const p = project({
    "packages/ui/src/x.tsx": `
      export function Recursive({ marker }: { marker?: string }) {
        return <><Recursive marker={marker} /><div className={marker} /></>;
      }
    `,
  });
  const result = walkStaticClassExpressions(p.getSourceFiles());
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
  const exact = evaluateStaticObjectProperties(p.getSourceFiles(), exactSpread.getExpression(), exactSpread, ["className", "dataProbe"]);
  expect(exact.properties.map((property) => [property.name, property.value.getText()])).toEqual([
    ["className", '"probe:last"'],
    ["dataProbe", '"yes"'],
  ]);
  expect(exact.properties.every((property) => property.consumer === exactSpread)).toBe(true);
  expect(exact.unresolved).toEqual([]);
  expect(evaluateStaticObjectProperties(p.getSourceFiles(), unresolvedSpread.getExpression(), unresolvedSpread, ["className"]).unresolved).not.toEqual([]);
  expect(evaluateStaticObjectProperties(p.getSourceFiles(), opaqueSpread.getExpression(), opaqueSpread, ["className"]).opaque).not.toEqual([]);
});

test("an imported computed non-class key stays outside class selection while a runtime key remains unresolved", () => {
  const p = project({
    "packages/ui/src/attributes.ts": 'export const LIVE_ATTRIBUTE = "data-live-token-root";\n',
    "packages/client/src/x.tsx": `
      import { LIVE_ATTRIBUTE } from "../../ui/src/attributes.ts";
      declare const runtimeKey: string;
      export const exact = <div {...{ [LIVE_ATTRIBUTE]: "" }} />;
      export const unknown = <div {...{ [runtimeKey]: "probe:unknown" }} />;
    `,
  });
  const result = walkStaticClassExpressions(p.getSourceFiles());
  expect(result.candidates).toEqual([]);
  expect(result.unresolved).toHaveLength(1);
  expect(result.unresolved[0]?.reason).toBe("computed selected-property key is unresolved");
});

test("applies spread overwrite order to member reads and invalidates values behind an unknown later spread", () => {
  const p = project({
    "packages/ui/src/x.ts": `
      const newest = { className: "probe:new" };
      const known = { className: "probe:old", ...newest };
      declare const runtime: Record<string, string>;
      const uncertain = { className: "probe:stale", ...runtime };
      const restored = { ...runtime, className: "probe:restored" };
      const nestedRuntime = { ...runtime };
      const nestedUncertain = { className: "probe:nested-stale", ...nestedRuntime };
      export const knownValue = known.className;
      export const uncertainValue = uncertain.className;
      export const restoredValue = restored.className;
      export const nestedUncertainValue = nestedUncertain.className;
    `,
  });
  const source = p.getSourceFileOrThrow(`${ROOT}/packages/ui/src/x.ts`);
  const memberReads = new Map(
    source
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter((node) => node.getName() === "className")
      .map((node) => [node.getExpression().getText(), node]),
  );
  const known = memberReads.get("known");
  const uncertain = memberReads.get("uncertain");
  const restored = memberReads.get("restored");
  const nestedUncertain = memberReads.get("nestedUncertain");
  if (known === undefined || uncertain === undefined || restored === undefined || nestedUncertain === undefined) {
    throw new Error("test fixture lost one of its className member reads");
  }
  const knownResult = evaluateStaticClassExpression(p.getSourceFiles(), known, known);
  expect(knownResult.candidates.map((candidate) => candidate.value)).toEqual(["probe:new"]);
  expect(knownResult.opaque).toEqual([]);

  const uncertainResult = evaluateStaticClassExpression(p.getSourceFiles(), uncertain, uncertain);
  expect(uncertainResult.candidates).toEqual([]);
  expect(uncertainResult.opaque.map((shape) => shape.reason)).toContain("runtime object spread under selected-property carrier");

  const restoredResult = evaluateStaticClassExpression(p.getSourceFiles(), restored, restored);
  expect(restoredResult.candidates.map((candidate) => candidate.value)).toEqual(["probe:restored"]);
  expect(restoredResult.opaque).toEqual([]);

  const nestedUncertainResult = evaluateStaticClassExpression(p.getSourceFiles(), nestedUncertain, nestedUncertain);
  expect(nestedUncertainResult.candidates).toEqual([]);
  expect(nestedUncertainResult.opaque.map((shape) => shape.reason)).toContain("runtime object spread under selected-property carrier");
});
