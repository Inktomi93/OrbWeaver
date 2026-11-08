// The installed React Compiler and the Babel line it runs under: the virtualizer memo exceptions expire when the
// compiler removes its denylist token, and the compiler must still compile what the client writes.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { z } from "zod";

const COMPILER = "babel-plugin-react-compiler";
const PLUGIN_BABEL = "@rolldown/plugin-babel";
const BABEL_CORE = "@babel/core";
const COMPILER_RUNTIME = "react/compiler-runtime";
const BUNDLE = "dist/index.js";
const VIRTUALIZER = "@tanstack/react-virtual";
const CLIENT_PACKAGE = "packages/client/package.json";
// A destructured default parameter is how the client's own components take optional props.
const DEFAULTED_COMPONENT = 'export function Label({ text = "none" }) { return <b>{text}</b>; }';

const BabelCore = z.object({
  transformSync: z.custom<(source: string, options: object) => { code?: string | null } | null>((value) => typeof value === "function"),
});

test("installed React Compiler still denylists the virtualizer used by manual-memo exceptions", ({ repoRoot }) => {
  const manifest = createRequire(resolve(repoRoot, CLIENT_PACKAGE)).resolve(`${COMPILER}/package.json`);
  const bundle = readFileSync(join(dirname(manifest), BUNDLE), "utf8");
  expect(bundle, "retire message-list/media-grid memo exceptions when this token disappears").toContain(VIRTUALIZER);
});

test("the Babel that @rolldown/plugin-babel runs lets the compiler compile a component with a destructured default parameter", ({ repoRoot }) => {
  const client = createRequire(resolve(repoRoot, CLIENT_PACKAGE));
  // The plugin loads its `@babel/core` peer from beside itself, so resolve it from the plugin's own location.
  const plugin = createRequire(client.resolve(PLUGIN_BABEL));
  const { transformSync } = BabelCore.parse(plugin(BABEL_CORE));
  const compiled = transformSync(DEFAULTED_COMPONENT, {
    babelrc: false,
    configFile: false,
    filename: "label.tsx",
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [[client(COMPILER), {}]],
  });
  expect(compiled?.code, "the compiler skips the component without a diagnostic when the Babel line is one it does not support").toContain(COMPILER_RUNTIME);
});
