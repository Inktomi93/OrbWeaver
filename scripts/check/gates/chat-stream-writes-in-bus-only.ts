import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;

export const gate: GateDescriptor = {
  name: "chat-stream-writes-in-bus-only",
  docRow: "UI-Gates-and-Lessons.md §11.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "chatStream (the stream store's WRITE api) imported outside data/bus/ — turn slots are driven by bus events through applyChatBusEvent only; components read via useTurnSlot/useTurnPhase. See UI-Gates-and-Lessons.md §11.1.",
  scanRoot: (p) => {
    if (p.includes("packages/client/src/data/bus/")) {
      return false;
    }
    if (p.endsWith("packages/client/src/main.tsx")) {
      return false;
    }
    if (TEST_FILE_RE.test(p)) {
      return false;
    }
    return true;
  },
  kinds: [SyntaxKind.ImportDeclaration],
  visit(node, _sf, ctx): void {
    if (!Node.isImportDeclaration(node)) {
      return;
    }

    const moduleSpecifier = node.getModuleSpecifierValue();
    if (moduleSpecifier !== "#state") {
      return;
    }

    const importClause = node.getImportClause();
    if (!importClause) {
      return;
    }

    const namedBindings = importClause.getNamedBindings();
    if (!(namedBindings && Node.isNamedImports(namedBindings))) {
      return;
    }

    for (const element of namedBindings.getElements()) {
      if (element.getName() === "chatStream") {
        ctx.report(element);
      }
    }
  },
  mustFlag: [
    {
      why: "import chatStream outside bus",
      files: {
        "src/some-component.tsx": `import { chatStream } from "#state";`,
      },
    },
  ],
  mustPass: [
    {
      why: "import chatStream in bus",
      files: {
        "packages/client/src/data/bus/index.ts": `import { chatStream } from "#state";`,
      },
    },
    {
      why: "import other things from #state",
      files: {
        "src/some-component.tsx": `import { useTurnSlot } from "#state";`,
      },
    },
  ],
};
