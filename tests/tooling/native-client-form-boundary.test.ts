import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { cruiseRules, fires, unresolvable } from "./_native-cruise.ts";

const CLIENT = "packages/client/src";
const FORM_LIBRARIES = ["@tanstack/react-form", "@tanstack/form-core"] as const;

const LIBRARY_CASES = FORM_LIBRARIES.flatMap((library) => [
  { library, entry: `${CLIENT}/forms/editor/probe.ts`, blocked: false },
  { library, entry: `${CLIENT}/forms/probe.ts`, blocked: true },
  { library, entry: `${CLIENT}/features/chat/probe.ts`, blocked: true },
  { library, entry: `${CLIENT}/components/probe.ts`, blocked: true },
]);

test.for(LIBRARY_CASES)("the native form seal judges $entry importing $library (blocked=$blocked)", async (row, { plantedTree }) => {
  const root = await plantedTree({
    "packages/client/package.json": JSON.stringify({ name: "@orb/client", dependencies: { [row.library]: "1.0.0" } }),
    [`node_modules/${row.library}/package.json`]: JSON.stringify({ name: row.library, version: "1.0.0", main: "index.js" }),
    [`node_modules/${row.library}/index.js`]: "export const value = 1;",
    [row.entry]: `export { value } from "${row.library}";`,
  });
  const rule = "client-tanstack-form-only-in-forms-editor";
  const violations = await cruiseRules(root, [row.entry], [rule]);
  expect(unresolvable(violations)).toEqual([]);
  expect(fires(violations, rule, [row.entry])).toBe(row.blocked);
});

const specifier = (entry: string, target: string): string => {
  const path = relative(dirname(entry), join(CLIENT, target));
  return path.startsWith(".") ? path : `./${path}`;
};

const DOOR_CASES = [
  { entry: `${CLIENT}/features/chat/probe.ts`, target: "forms/editor/index.ts", blocked: false },
  { entry: `${CLIENT}/features/chat/probe.ts`, target: "forms/editor/use-app-form.ts", blocked: true },
  { entry: `${CLIENT}/features/chat/probe.ts`, target: "forms/editor/bound-fields/text-field.ts", blocked: true },
  { entry: `${CLIENT}/forms/probe.ts`, target: "forms/editor/use-app-form.ts", blocked: true },
  { entry: `${CLIENT}/forms/editor/probe.ts`, target: "forms/editor/use-app-form.ts", blocked: false },
];

test.for(DOOR_CASES)("the editor front door judges $entry importing $target (blocked=$blocked)", async (row, { plantedTree }) => {
  const root = await plantedTree({
    "packages/client/package.json": JSON.stringify({ name: "@orb/client" }),
    [`${CLIENT}/${row.target}`]: "export const value = 1;",
    [row.entry]: `export { value } from "${specifier(row.entry, row.target)}";`,
  });
  const rule = "client-forms-editor-front-door";
  const violations = await cruiseRules(root, [row.entry], [rule]);
  expect(unresolvable(violations)).toEqual([]);
  expect(fires(violations, rule, [row.entry])).toBe(row.blocked);
});
