import { ModuleKind, ModuleResolutionKind, Project, ScriptKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { StaticClassFactResult } from "../../../../tooling/src/verify/contract/static-class-expression.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { createStaticClassFactReader, STATIC_CLASS_FACT_KINDS, staticClassFact } from "../../../../tooling/src/verify/lib/static-class-facts.ts";
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
  const reader = createStaticClassFactReader(project.getSourceFiles());
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
  expect(facts.carriers).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "composer", composer: "join" })]));
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

test("keeps readable tv leaves when one sibling template is dynamic", () => {
  const facts = factsOf({
    "packages/ui/src/x.ts": `
      import { tv } from "tailwind-variants";
      declare const runtime: string;
      export const recipe = tv({
        base: "probe:base",
        slots: { root: "probe:slot" },
        variants: { tone: { loud: "probe:variant", mixed: \`probe:mixed \${runtime}\` } },
        compoundVariants: [{ tone: "loud", class: "probe:compound" }],
      });
    `,
  });

  expect(facts.tokens.map((token) => token.value).sort()).toEqual(["probe:base", "probe:compound", "probe:slot", "probe:variant"].sort());
  expect(facts.runtimePrefixes.map((prefix) => prefix.prefix)).toContain("probe:mixed ");
});

test("resolves recipe result and slot calls back to their proven tv definition", () => {
  const facts = factsOf({
    "packages/ui/src/recipe.ts": `
      import { tv } from "tailwind-variants";
      export const recipe = tv({ slots: { root: "probe:slot" }, variants: { tone: { loud: { root: "probe:variant" } } } });
    `,
    "packages/client/src/x.tsx": `
      import { recipe as imported } from "../../ui/src/recipe.ts";
      const slots = imported({ tone: "loud" });
      export const A = <div className={slots.root()} />;
    `,
  });

  expect(facts.tokens.map((token) => token.value).sort()).toEqual(["probe:slot", "probe:variant"]);
  expect(facts.tokens.find((token) => token.value === "probe:slot")?.consumers.map((consumer) => consumer.getKindName())).toContain("JsxAttribute");
});

test("rejects className prose records while preserving the Lucide tuple terminal", () => {
  const facts = factsOf({
    "packages/client/src/x.tsx": `
      import { createLucideIcon } from "lucide-react";
      const records = [{ className: "Warden of House Vane" }];
      export const Icon = createLucideIcon("Probe", [["path", { className: "probe:lucide", d: "M0 0" }]]);
    `,
  });

  expect(facts.tokens.map((token) => token.value)).toEqual(["probe:lucide"]);
});

test("cannot resolve class values through source files outside its exact population", () => {
  const project = projectOf({
    "packages/client/src/allowed.tsx": `import { hidden, style } from "./excluded.ts"; export const A = <div className={hidden} style={style} />;`,
    "packages/client/src/excluded.ts": `export const hidden = "probe:outside"; export const style = { color: "red" } as const;`,
  });
  const allowed = project.getSourceFileOrThrow(`${ROOT}/packages/client/src/allowed.tsx`);
  const reader = createStaticClassFactReader([allowed]);
  allowed.forEachDescendant((node) => {
    if ((STATIC_CLASS_FACT_KINDS as readonly number[]).includes(node.getKind())) {
      reader.visit(node);
    }
  });

  const facts = reader.finish();
  expect(facts.tokens).toEqual([]);
  expect(facts.styleProperties).toEqual([]);
  expect([...facts.unresolved, ...facts.opaque]).not.toEqual([]);
});

function policy(): GatePolicy {
  return defineGate({
    id: "static-class-reader-proof",
    family: "static-class-reader-proof",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "types",
    execution: "entire-population",
    facts: [staticClassFact],
    resources: [],
    message: "dark class token",
    create: (context) => ({
      evaluate: () => {
        const facts = context.fact(staticClassFact);
        context.receipt({ kind: "population", source: "static-class-token", members: facts.tokens.length, unresolved: facts.unresolved.length });
        for (const token of facts.tokens.filter((candidate) => candidate.value.startsWith("dark:"))) {
          const segment = token.segments[0];
          if (segment !== undefined) {
            context.report.node(segment.node, { token: token.value, offset: segment.sourceStart - segment.node.getStart() });
          }
        }
      },
    }),
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

/** A consumer that judges the facts WITHOUT re-filing the census as its own receipt, so the arms below
 *  isolate the PROVIDER's verdict from a consumer's own blindness door. */
function deliveryProbe(capture: (facts: StaticClassFactResult) => void, population: GatePolicy["population"] = "@frontend"): GatePolicy {
  return defineGate({
    id: "static-class-delivery-probe",
    family: "static-class-reader-proof",
    authority: "hard",
    severity: "error",
    population,
    analysis: "types",
    execution: "entire-population",
    facts: [staticClassFact],
    resources: [],
    message: "static class delivery probe",
    create: (context) => ({
      evaluate: () => {
        capture(context.fact(staticClassFact));
        context.receipt({ kind: "population", source: "static-class-delivery-probe", members: 1 });
      },
    }),
    mustFlag: [
      { mode: "types", files: { "packages/client/src/x.tsx": 'export const X = <div className="dark:bg-card" />;' }, why: "descriptor proof control" },
    ],
    mustPass: [{ mode: "types", files: { "packages/client/src/x.tsx": 'export const X = <div className="bg-card" />;' }, why: "descriptor proof control" }],
  });
}

test("a frontend corpus with NO class token is DELIVERED — the provider receipt is not the accuser", () => {
  // THE #1962 ROW. `members` used to be the TOKEN CENSUS, and `factReceiptFailures` refuses `members === 0`
  // and withholds every consumer BEFORE `evaluate` (`lib/policy-pass.ts`), so a frontend corpus authoring no
  // class at all would have preempted any policy whose job is to report that. A receipt states the
  // denominator the provider WALKED; an empty census is delivered data the consumer judges.
  let captured: StaticClassFactResult | undefined;
  const gate = deliveryProbe((facts) => {
    captured = facts;
  });
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project: projectOf({ "packages/client/src/plain.ts": "export const plain = 1;\n" }),
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(captured?.tokens).toEqual([]);
  expect(result.facts[0]).toMatchObject({
    id: "static-class",
    status: "success",
    receipts: [{ kind: "population", source: "static-class-sources", members: 1, unresolved: 0 }],
  });
});

test("UNREADABLE authored syntax is DELIVERED as corpus data, never receipted as a broken instrument", () => {
  // THE SECOND HALF OF THE SAME RULE (owner ruling, 2026-09-11). A receipt's `unresolved` means "I could not
  // complete my MEASUREMENT"; `receiptFailures` treats it as a broken instrument and withholds every
  // consumer. A `className` bound to a mutated alias is something this reader successfully measured and
  // CLASSIFIED — a fact about the corpus — so it rides `facts.unresolved` on the value, where a consumer can
  // read it and REPORT it. Publishing it as a receipt field was the steady-state detonation: one mutated
  // alias anywhere in `@client`/`@ui` would have withheld every consumer of a frontend-wide reader forever.
  // Restore `unresolved: facts.unresolved.length` to the provider receipt and this row dies on the first
  // assertion (measured: the fact refuses at `receipt` and `captured` never arrives).
  let captured: StaticClassFactResult | undefined;
  const gate = deliveryProbe((facts) => {
    captured = facts;
  });
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project: projectOf({
      "packages/client/src/x.tsx": 'let mutable = "probe:stale";\nmutable = "probe:new";\nexport const A = <div className={mutable} />;\n',
    }),
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // The consumer ran, and the unreadable syntax reached it AS DATA — reason and node included, which is what
  // a policy needs to report it. The receipt states only the denominator walked.
  expect(captured?.unresolved.map(({ reason }) => reason).join(" ")).toContain("mutable");
  expect(captured?.tokens.map((token) => token.value)).not.toContain("probe:stale");
  // One walked source, and ZERO declared instrument failures even though the corpus holds one unreadable
  // expression — the receipt normalizes an omitted `unresolved` to 0, which is exactly the claim being made.
  expect(result.facts[0]?.receipts).toEqual([{ kind: "population", source: "static-class-sources", members: 1, unresolved: 0 }]);
});

test("a provider that could not LOOK refuses one phase EARLIER, at its own population", () => {
  // The blindness the receipt fix does NOT disarm: zero admitted frontend paths. The POLICY's population is
  // wider than the FACT's so the policy has files while the provider has none — the shape that isolates a
  // provider-population refusal from a policy-population one.
  let captured: StaticClassFactResult | undefined;
  const gate = deliveryProbe(
    (facts) => {
      captured = facts;
    },
    { in: ["@client", "@server"], ext: ["ts", "tsx"] },
  );
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project: projectOf({ "packages/server/src/x.ts": "export const outsideTheFrontend = 1;\n" }),
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(captured).toBeUndefined();
  expect(result.factErrors.map(({ factId, phase }) => `${factId}/${phase}`)).toEqual(["static-class/population"]);
  expect(result.authority.withheldPolicyIds).toEqual(["static-class-delivery-probe"]);
});

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
