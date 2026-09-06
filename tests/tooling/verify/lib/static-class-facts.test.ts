import { ModuleKind, ModuleResolutionKind, Project, ScriptKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { StaticClassFactResult } from "../../../../tooling/src/verify/contract/static-class-expression.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { createStaticClassFactReader, STATIC_CLASS_FACT_KINDS } from "../../../../tooling/src/verify/lib/static-class-facts.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/static-class-facts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext, jsx: 4 },
  });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source, { scriptKind: path.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS });
  }
  return project;
}

function factsOf(files: Readonly<Record<string, string>>): StaticClassFactResult {
  const project = projectOf(files);
  const reader = createStaticClassFactReader();
  for (const source of project.getSourceFiles()) {
    source.forEachDescendant((node) => {
      if ((STATIC_CLASS_FACT_KINDS as readonly number[]).includes(node.getKind())) {
        reader.visit(node);
      }
    });
  }
  return reader.finish();
}

test("proves JSX and declaration-bound composer carriers without granting a name shadow", () => {
  const facts = factsOf({
    "packages/client/src/x.tsx": `
      import cx, { clsx as join } from "clsx";
      import * as variants from "tailwind-variants";
      const alias = join;
      const key = "root";
      const map = { root: "probe:member" } as const;
      const shared = ["probe:array", { "probe:object-key": true }] as const;
      const exact = \`probe:template-\${"exact"}\`;
      function clsx(value: string) { return value.length; }
      export const A = <div className={["probe:jsx", map[key], exact]} />;
      export const B = alias(shared);
      export const C = cx({ "probe:default-map": true });
      export const D = variants.tv({ base: "probe:base", slots: { icon: "probe:slot" }, variants: { tone: { loud: "probe:variant" } }, compoundVariants: [{ tone: "loud", className: "probe:compound" }], defaultVariants: { tone: "probe:not-selector" } });
      export const inert = clsx("probe:shadow");
    `,
  });

  expect(facts.tokens.map((token) => token.value).sort()).toEqual(
    [
      "probe:array",
      "probe:base",
      "probe:compound",
      "probe:default-map",
      "probe:jsx",
      "probe:member",
      "probe:object-key",
      "probe:slot",
      "probe:template-exact",
      "probe:variant",
    ].sort(),
  );
  expect(facts.tokens.map((token) => token.value)).not.toContain("probe:shadow");
  expect(facts.tokens.map((token) => token.value)).not.toContain("probe:not-selector");
  expect(facts.carriers.map((carrier) => carrier.kind)).toEqual(expect.arrayContaining(["jsx-class", "composer"]));
});

test("resolves imported aliases, object spreads, and class member aliases at their producer occurrence", () => {
  const facts = factsOf({
    "packages/client/src/classes.ts": `
      export const base = { className: "probe:first" } as const;
      export const props = { ...base, className: "probe:last" } as const;
      export const classes = { root: "probe:member-alias" } as const;
    `,
    "packages/client/src/x.tsx": `
      import { classes, props as spread } from "./classes.ts";
      const member = classes.root;
      export const A = <div {...spread} />;
      export const B = <div className={member} />;
    `,
  });

  expect(facts.tokens.map((token) => token.value).sort()).toEqual(["probe:first", "probe:last", "probe:member-alias"]);
  const producerLines = facts.tokens.map((token) => token.segments[0]?.node.getStartLineNumber()).sort();
  expect(producerLines).toEqual([2, 3, 4]);
});

test("keeps dynamic templates, mutable aliases, and malformed composer inputs explicit", () => {
  const facts = factsOf({
    "packages/client/src/x.tsx": `
      import { clsx } from "clsx";
      import { tv } from "tailwind-variants";
      import { cva } from "class-variance-authority";
      import { tv as counterfeit } from "not-tailwind-variants";
      declare const runtime: string;
      declare const config: Record<string, unknown>;
      let mutable = "probe:stale";
      mutable = "probe:new";
      export const A = <div className={\`probe:prefix \${runtime}\`} />;
      export const B = <div className={mutable} />;
      export const C = clsx(config);
      export const D = tv();
      export const E = cva("probe:base", "malformed");
      export const F = counterfeit({ base: "probe:wrong-module" });
      export const G = clsx(\`w-\${runtime}\`);
    `,
  });

  expect(facts.runtimePrefixes.map((prefix) => prefix.prefix)).toContain("probe:prefix ");
  expect(facts.runtimePrefixes.map((prefix) => prefix.prefix)).toContain("w-");
  expect(facts.unresolved.map((item) => item.reason).join(" ")).toContain("mutable");
  expect(facts.opaque.map((item) => item.reason).join(" ")).toContain("runtime");
  expect(facts.unresolved.map((item) => item.reason).join(" ")).toContain("configuration");
  expect(facts.tokens.map((token) => token.value)).not.toContain("probe:wrong-module");
  expect(facts.tokens.map((token) => token.value)).not.toContain("probe:stale");
});

test("emits exact JSX style writers through direct and spread carriers", () => {
  const facts = factsOf({
    "packages/client/src/x.tsx": `
      const style = { borderRadius: "8px", "--color-primary": "red" } as const;
      const props = { className: "probe:spread", style } as const;
      const orphan = { className: "probe:unconsumed-writer" } as const;
      const className = "probe:shorthand-writer";
      const shorthand = { className };
      export const A = <div style={style} />;
      export const B = <div {...props} />;
    `,
  });

  expect(facts.styleProperties.map((property) => property.name).sort()).toEqual(["--color-primary", "--color-primary", "borderRadius", "borderRadius"]);
  expect(facts.tokens.map((token) => token.value).sort()).toEqual(["probe:shorthand-writer", "probe:spread", "probe:unconsumed-writer"]);
  expect(facts.carriers.filter((carrier) => carrier.kind === "class-property")).toHaveLength(3);
});

function policy(): GatePolicy {
  return defineGate({
    id: "static-class-reader-proof",
    family: "static-class-reader-proof",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "types",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "dark class token",
    create: (context) => {
      const reader = createStaticClassFactReader();
      return {
        visitors: [{ kinds: STATIC_CLASS_FACT_KINDS, visit: reader.visit }],
        evaluate: () => {
          const facts = reader.finish();
          context.receipt({ kind: "population", source: "static-class-token", members: facts.tokens.length, unresolved: facts.unresolved.length });
          for (const token of facts.tokens.filter((candidate) => candidate.value.startsWith("dark:"))) {
            const segment = token.segments[0];
            if (segment !== undefined) {
              context.report.node(segment.node, { token: token.value, offset: segment.sourceStart - segment.node.getStart() });
            }
          }
        },
      };
    },
    mustFlag: [
      {
        mode: "types",
        files: { "packages/client/src/x.tsx": 'import { clsx } from "clsx"; export const X = clsx("dark:bg-card");' },
        expect: { token: "dark:bg-card" },
        why: "the production visitor/evaluate path receives composer and token facts",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: { "packages/client/src/x.tsx": 'export const X = <div className="bg-card" />;' },
        why: "a resolved non-dark class token passes",
      },
    ],
  });
}

test("composes with the production policy context and shared dispatcher", () => {
  const project = projectOf({
    "packages/client/src/x.tsx": 'import { clsx } from "clsx"; const value = "dark:bg-card"; export const X = clsx(value);',
  });
  const gate = policy();
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.findings).toMatchObject([{ token: "dark:bg-card" }]);
  expect(result.policies[0]?.receipts).toEqual([{ kind: "population", source: "static-class-token", members: 1, unresolved: 0 }]);
});
