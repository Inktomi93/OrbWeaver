// The @orb/ui primitive trio (UI-Primitives-and-Reuse.md §13.7): every primitives/<name>/ directory is
// <name>.tsx + index.ts + variants.ts, the variants file has one tv() export named {camelName}Variants, and no
// file in the directory has a default export. The directories are read from the tree, never listed here.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const PRIMITIVES = fileURLToPath(new URL("../../packages/ui/src/primitives", import.meta.url));
const NAMES = readdirSync(PRIMITIVES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .toSorted();

// Sealed satellites and barrels with no skin of their own; each is a primitive that composes classes inline or
// wraps one vendor part.
const VARIANTS_EXEMPT = new Set(["virtual-list", "message-list", "aria-announcer", "file-trigger", "background-layer"]);

// `icons/` is the icon set's home and its one component is `Icon`, so its files and variants take the singular.
const COMPONENT_NAME: Readonly<Record<string, string>> = { icons: "icon" };
const componentOf = (name: string): string => COMPONENT_NAME[name] ?? name;

const camel = (name: string): string => name.replaceAll(/-([a-z0-9])/gu, (_, letter: string) => letter.toUpperCase());
const read = (name: string, file: string): string => readFileSync(join(PRIMITIVES, name, file), "utf8");
const files = (name: string): string[] => readdirSync(join(PRIMITIVES, name));
const TV_EXPORT = /^export const (?<id>\w+) = tv\(/gmu;
const DEFAULT_EXPORT = /^export default\b/mu;

forEachNonEmpty(NAMES, "primitive directories", (name) => {
  test(`${name} has the component file and the index`, () => {
    expect(files(name)).toEqual(expect.arrayContaining([`${componentOf(name)}.tsx`, "index.ts"]));
  });

  test(`${name} has no default export`, () => {
    const defaults = files(name)
      .filter((file) => /\.tsx?$/u.test(file))
      .filter((file) => DEFAULT_EXPORT.test(read(name, file)));
    expect(defaults).toEqual([]);
  });
});

forEachNonEmpty(
  NAMES.filter((name) => !VARIANTS_EXEMPT.has(name)),
  "primitives with a variants file",
  (name) => {
    test(`${name} has one tv() export named for it`, () => {
      expect(files(name)).toContain("variants.ts");
      const exported = [...read(name, "variants.ts").matchAll(TV_EXPORT)].map((match) => match.groups?.["id"]);
      expect(exported).toEqual([`${camel(componentOf(name))}Variants`]);
    });
  },
);

test.for([...VARIANTS_EXEMPT])("the variants exemption for %s names a primitive that has no variants file", (name) => {
  expect(NAMES).toContain(name);
  expect(files(name)).not.toContain("variants.ts");
});
