import { PRODUCT_STYLESHEETS } from "../../../../tooling/src/verify/contract/css-family.ts";
import type { ResourceLoad, ResourceReader, ResourceTreeEntry } from "../../../../tooling/src/verify/contract/resource.ts";
import { AUTHORED_TREE_PATHS } from "../../../../tooling/src/verify/contract/resource-tree.ts";
import { loadAuthoredCss, loadAuthoredTree, loadProductCss } from "../../../../tooling/src/verify/ops/resource-tree.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const entry = (path: string, kind: ResourceTreeEntry["kind"] = "file"): ResourceTreeEntry => ({
  path,
  kind,
  bytes: 1,
  lines: 1,
  nulBytes: 0,
  origin: "overlay",
});

function readerWith(options: {
  readonly trees?: Readonly<Record<string, ResourceLoad<readonly ResourceTreeEntry[]>>>;
  readonly texts?: Readonly<Record<string, ResourceLoad<string>>>;
  readonly treeCalls?: string[];
  readonly readCalls?: string[];
}): ResourceReader {
  return {
    tree: (path): ResourceLoad<readonly ResourceTreeEntry[]> => {
      options.treeCalls?.push(path);
      return options.trees?.[path] ?? { status: "missing", reason: `missing tree: ${path}`, paths: [path], members: 0 };
    },
    read: (path): ResourceLoad<string> => {
      options.readCalls?.push(path);
      return options.texts?.[path] ?? { status: "missing", reason: `missing file: ${path}`, paths: [path], members: 0 };
    },
  };
}

function readyValue<T>(load: ResourceLoad<T>): T {
  if (load.status !== "ready") {
    throw new Error(`expected ready resource, got ${load.status}: ${load.reason}`);
  }
  return load.value;
}

function unavailableReason<T>(load: ResourceLoad<T>): string {
  if (load.status === "ready") {
    throw new Error("expected unavailable resource, got ready");
  }
  return load.reason;
}

test("the authored-tree axis resolves every closed id to its exact gate-root path", () => {
  expect(AUTHORED_TREE_PATHS).toEqual({
    "server-domain": "packages/server/src/domain",
    "client-feature": "packages/client/src/features",
    "ui-primitive": "packages/ui/src/primitives",
    "tooling-slot": "tooling/src",
    "db-schema": "packages/db/src/schema",
    "db-migration": "packages/db/src/migrations",
    server: "packages/server/src",
    packages: "packages",
    tests: "tests",
    "client-source": "packages/client/src",
    "ui-source": "packages/ui/src",
    gate: "tooling/src/verify/gates",
  });
  for (const [id, path] of Object.entries(AUTHORED_TREE_PATHS)) {
    const calls: string[] = [];
    const expected = { status: "ready", value: [entry(`${path}/x.ts`)], paths: [`${path}/x.ts`], members: 1 } as const;
    const load = loadAuthoredTree(readerWith({ trees: { [path]: expected }, treeCalls: calls }), id as keyof typeof AUTHORED_TREE_PATHS);
    expect(load).toBe(expected);
    expect(calls).toEqual([path]);
  }
});

test("authored CSS shares the client/ui trees, reads CSS only, and preserves parser source positions", () => {
  const client = "packages/client/src/features/x/x.css";
  const ui = "packages/ui/src/styles/globals.css";
  const readCalls: string[] = [];
  const treeCalls: string[] = [];
  const reader = readerWith({
    trees: {
      "packages/client/src": {
        status: "ready",
        value: [entry("packages/client/src/features"), entry(client), entry("packages/client/src/x.ts")],
        paths: [client],
        members: 3,
      },
      "packages/ui/src": { status: "ready", value: [entry(ui)], paths: [ui], members: 1 },
    },
    texts: {
      [client]: { status: "ready", value: "/* ignored { } */\n.x, :not(.a, .b) {\n  color: red;\n}\n", paths: [client], members: 1 },
      [ui]: { status: "ready", value: "@layer base {\n  .u { display: grid; }\n}\n", paths: [ui], members: 1 },
    },
    readCalls,
    treeCalls,
  });

  const loaded = loadAuthoredCss(reader);

  expect(treeCalls).toEqual(["packages/client/src", "packages/ui/src"]);
  expect(readCalls).toEqual([client, ui]);
  expect(loaded).toMatchObject({ status: "ready", paths: [client, ui], members: 2 });
  const files = readyValue(loaded);
  expect(files[0]).toEqual({
    path: client,
    text: "/* ignored { } */\n.x, :not(.a, .b) {\n  color: red;\n}\n",
    atRules: [],
    rules: [
      {
        selectorList: ".x, :not(.a, .b)",
        selectors: [".x", ":not(.a, .b)"],
        line: 2,
        preludeStart: 0,
        braceStart: 35,
        declarations: [{ prop: "color", value: "red", rawValue: "red", line: 3, column: 3, offset: 39, valueOffset: 46 }],
      },
    ],
  });
  expect(files[1]?.rules[0]?.line).toBe(2);
});

test("authored CSS refuses a missing source tree and an inventory with no CSS", () => {
  const missing = loadAuthoredCss(
    readerWith({
      trees: {
        "packages/client/src": { status: "missing", reason: "gone", paths: ["packages/client/src"], members: 0 },
        "packages/ui/src": { status: "ready", value: [entry("packages/ui/src/x.ts")], paths: ["packages/ui/src/x.ts"], members: 1 },
      },
    }),
  );
  expect(missing).toEqual({
    status: "missing",
    reason: "packages/client/src CSS inventory: gone",
    paths: ["packages/client/src", "packages/ui/src"],
    members: 0,
  });

  const empty = loadAuthoredCss(
    readerWith({
      trees: {
        "packages/client/src": { status: "ready", value: [entry("packages/client/src/x.ts")], paths: ["packages/client/src/x.ts"], members: 1 },
        "packages/ui/src": { status: "ready", value: [entry("packages/ui/src/x.ts")], paths: ["packages/ui/src/x.ts"], members: 1 },
      },
    }),
  );
  expect(empty).toEqual({ status: "empty", reason: "authored CSS inventory has no stylesheets", paths: [], members: 0 });
});

test("product CSS reads the exact five-home contract without consulting an ambient tree", () => {
  const readCalls: string[] = [];
  const texts = Object.fromEntries(
    PRODUCT_STYLESHEETS.map((path) => [path, { status: "ready", value: ".x { color: var(--color-foreground); }\n", paths: [path], members: 1 }]),
  ) as Readonly<Record<string, ResourceLoad<string>>>;
  const loaded = loadProductCss(readerWith({ texts, readCalls }));

  expect(readCalls).toEqual(PRODUCT_STYLESHEETS);
  expect(loaded).toMatchObject({ status: "ready", paths: PRODUCT_STYLESHEETS });
  expect(readyValue(loaded).map((file) => file.path)).toEqual(PRODUCT_STYLESHEETS);
});

test("CSS acquisition refuses missing, empty, and parser-unsupported files instead of returning partial facts", () => {
  const base = Object.fromEntries(
    PRODUCT_STYLESHEETS.map((path) => [path, { status: "ready", value: ".x { color: red; }\n", paths: [path], members: 1 }]),
  ) as Record<string, ResourceLoad<string>>;

  for (const [status, replacement] of [
    ["missing", { status: "missing", reason: "gone", paths: [PRODUCT_STYLESHEETS[1]], members: 0 }],
    ["empty", { status: "empty", reason: "zero bytes", paths: [PRODUCT_STYLESHEETS[1]], members: 0 }],
    ["unresolved", { status: "unresolved", reason: "invalid UTF-8", paths: [PRODUCT_STYLESHEETS[1]], members: 0 }],
  ] as const) {
    const loaded = loadProductCss(readerWith({ texts: { ...base, [PRODUCT_STYLESHEETS[1]]: replacement } }));
    expect(loaded.status).toBe(status);
    expect(loaded.members).toBe(1);
  }

  for (const malformed of [".x { color: red;\n", '.x { content: "a;b"; }\n', '.x[data-label="a\\"b"] {}\n', "/* never closed\n.x {}\n"]) {
    const loaded = loadProductCss(
      readerWith({ texts: { ...base, [PRODUCT_STYLESHEETS[0]]: { status: "ready", value: malformed, paths: [PRODUCT_STYLESHEETS[0]], members: 1 } } }),
    );
    expect(loaded.status).toBe("malformed");
    expect(unavailableReason(loaded)).toContain(PRODUCT_STYLESHEETS[0]);
  }

  const quotedDelimiter = loadProductCss(
    readerWith({
      texts: {
        ...base,
        [PRODUCT_STYLESHEETS[0]]: {
          status: "ready",
          value: '.x { content: "a;b"; }\n',
          paths: [PRODUCT_STYLESHEETS[0]],
          members: 1,
        },
      },
    }),
  );
  expect(quotedDelimiter).toMatchObject({
    status: "malformed",
    reason: expect.stringContaining("quoted delimiter or escaped quote"),
  });
});
