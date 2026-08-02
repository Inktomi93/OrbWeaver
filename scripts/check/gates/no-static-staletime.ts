import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TEST_REGEX = /\.test\.tsx?$/u;

const MESSAGE =
  "staleTime:'static' silently ignores invalidateQueries — it would disable the SSE bus→cache seam with a green check. Use Infinity (invalidation still overrides it). See UI-Lib-TanStack-Query.md §F (item 2) / UI-Architecture-and-Layout.md §6.1.";

export const gate: GateDescriptor = {
  name: "no-static-staletime",
  docRow: "UI-Lib-TanStack-Query.md §F (item 2) / UI-Architecture-and-Layout.md §6.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Change staleTime to Infinity.",
  scanRoot: (p) => {
    const path = `/${p}`;
    if (TEST_REGEX.test(path)) {
      return false;
    }
    return true;
  },
  kinds: [SyntaxKind.PropertyAssignment],
  visit: (node, _sf, ctx) => {
    if (!Node.isPropertyAssignment(node)) {
      return;
    }
    if (node.getName() === "staleTime") {
      const initializer = node.getInitializer();
      if (initializer && (initializer.getText() === '"static"' || initializer.getText() === "'static'" || initializer.getText() === "`static`")) {
        ctx.report(node, { token: "staleTime", offset: 0 });
      }
    }
  },
  mustFlag: [
    {
      files: 'const query = useQuery({ queryKey: ["key"], staleTime: "static" });',
      at: "packages/client/src/feature/query.ts",
      why: "staleTime set to static",
    },
  ],
  mustPass: [
    {
      files: 'const query = useQuery({ queryKey: ["key"], staleTime: Infinity });',
      at: "packages/client/src/feature/query.ts",
      why: "staleTime set to Infinity",
    },
    {
      files: 'const query = useQuery({ queryKey: ["key"], staleTime: "static" });',
      at: "packages/client/src/feature/query.test.ts",
      why: "allowlisted test file",
    },
  ],
};
