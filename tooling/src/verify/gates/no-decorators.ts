import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

export const gate = defineGate({
  id: "no-decorators",
  family: "no-decorators",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@tooling", "@tests", "@scripts"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    "decorators are not erasable — tsx/node type-stripping has no decorator runtime (runtime error), and the erasableSyntaxOnly compiler flag does NOT catch them. Use function composition / zod, not decorators. See Spine-TypeScript-and-Patterns.md §5.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Decorator],
        visit: (node) => {
          if (Node.isDecorator(node)) {
            ctx.report.node(node);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      why: "decorator on class",
      files: { "packages/server/src/probe.ts": "@Injectable()\nclass Foo {}\n" },
    },
    {
      mode: "source",
      why: "decorator on property",
      files: { "packages/server/src/probe.ts": "class Foo {\n  @Column()\n  id: string;\n}\n" },
    },
    {
      mode: "source",
      why: "decorators on a method, accessor, and parameter are all the same forbidden runtime syntax",
      files: {
        "packages/server/src/probe.ts":
          "class Foo {\n  @Trace()\n  method(@Inject() value: string): string { return value; }\n  @Read()\n  get current(): string { return ''; }\n  @Write()\n  set current(value: string) {}\n}\n",
      },
      expect: { count: 4 },
    },
  ],
  mustPass: [
    {
      mode: "source",
      why: "no decorators",
      files: { "packages/server/src/probe.ts": "class Foo {\n  id: string;\n}\n" },
    },
  ],
});
