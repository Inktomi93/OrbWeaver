import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ident, parse, walk } from "@eslint/css-tree";

const RELATIVE_IMPORT = /^\s*(?:url\()?["']?(\.{1,2}\/[^"')]+)["']?\)?/u;

/** The sheet and every relative `@import` it reaches; a package import is Tailwind's or the ui entry's, never an author sheet. */
function authorSheets(path: string, seen = new Set<string>()): string[] {
  if (seen.has(path)) {
    return [];
  }
  seen.add(path);
  const sheets = [path];
  const ast = parse(readFileSync(path, "utf8"), { parseAtrulePrelude: false, parseValue: false });
  walk(ast, {
    enter(node): void {
      if (node.type === "Atrule" && node.name === "import" && node.prelude?.type === "Raw") {
        const relative = RELATIVE_IMPORT.exec(node.prelude.value)?.[1];
        if (relative !== undefined) {
          sheets.push(...authorSheets(resolve(dirname(path), relative), seen));
        }
      }
    },
  });
  return sheets;
}

/** Feed layered author classes to the native Tailwind rule without admitting undeclared names. */
export function authorClassIgnores(paths: readonly string[]): string[] {
  const names = new Set<string>();
  for (const path of paths.flatMap((entry) => authorSheets(entry))) {
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
