import { readFileSync } from "node:fs";
import { ident, parse, walk } from "@eslint/css-tree";

/** Feed unlayered author classes to the native Tailwind rule without admitting undeclared names. */
export function authorClassIgnores(paths: readonly string[]): string[] {
  const names = new Set<string>();
  for (const path of paths) {
    const ast = parse(readFileSync(path, "utf8"), { parseAtrulePrelude: false, parseValue: false });
    walk(ast, {
      enter(node): void {
        if (node.type === "ClassSelector") {
          names.add(ident.decode(node.name));
        }
      },
    });
  }
  return Array.from(names, (name) => `^${RegExp.escape(name)}$`).sort();
}
