import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-decorators",
  docRow: "Spine-TypeScript-and-Patterns.md §5",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "decorators are not erasable — tsx/node type-stripping has no decorator runtime (runtime error), and the erasableSyntaxOnly compiler flag does NOT catch them. Use function composition / zod, not decorators. See Spine-TypeScript-and-Patterns.md §5.",
  scanRoot: () => true,
  kinds: [SyntaxKind.Decorator],
  visit(node, _sf, ctx): void {
    if (Node.isDecorator(node)) {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: "decorator on class",
      files: `
        @Injectable()
        class Foo {}
      `,
    },
    {
      why: "decorator on property",
      files: `
        class Foo {
          @Column()
          id: string;
        }
      `,
    },
  ],
  mustPass: [
    {
      why: "no decorators",
      files: `
        class Foo {
          id: string;
        }
      `,
    },
  ],
};
