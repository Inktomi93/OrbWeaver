// #1201 / docs/design/1208-instrument-substrate.md §3.7 — a `.screenshot({ path })` in tests/** whose path
// carries authored `reports/` text is RED: that literal can name a PUBLISHED `latest` pointer, and an
// ordinary write FOLLOWS the symlink into whichever run currently owns it, rewriting a finished run's
// evidence invisibly. The sanctioned door is `ctSnapPath(name)`, which resolves at RUNTIME. Every read here
// is a shared one: the method and the `path` key through the member reader (so `page["screenshot"]` and
// `{ ["path"]: … }` are the same shapes), and the value through the static-text reader, which follows a
// const or an imported constant one hop the legacy literal-only arm could not. Limits are in mustPass.
//
// FAMILY `no-direct-reports-write` — a declared SINGLETON. Its subject is ONE instrument-substrate hazard
// (§3.7's published `latest` pointer) at ONE call shape, and no sibling policy judges a write target. The
// machinery is shared rather than private: `lib/reference-fact.ts` (member identity, binding stability,
// member-write inspection), `lib/template-static-text.ts` for the authored path, and
// `lib/property-assignment-name.ts` for the option key. A shared hazard TOPIC is not a family (guide §3).
//
// POPULATION PORT: byte-identical, legacy at `ef2251957^` (`scanRoot: (p) => p.startsWith("tests/")`); the
// final `TESTS_POPULATION` is the `@tests` root, which is that prefix exactly.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { propertyAssignmentName } from "../lib/property-assignment-name.ts";
import { inspectReferenceWrites, readMemberReference, resolveStableExpression } from "../lib/reference-fact.ts";
import { readStaticTextOf } from "../lib/template-static-text.ts";

const SCREENSHOT = "screenshot";
const PATH_KEY = "path";
const NEEDLE = "reports/";

const MESSAGE =
  'a .screenshot({ path }) call in tests/** hands a "reports/"-carrying authored path — the write follows ' +
  "whichever run currently owns that published pointer and rewrites its evidence invisibly " +
  "(docs/design/1208-instrument-substrate.md §3.7).";

const FIX =
  'resolve the path through tests/support/node/snap-out.ts ctSnapPath("name") instead of a hand-spelled ' +
  '"reports/…" literal or template. A deliberate site is waived with `@orb-waive ' +
  "no-direct-reports-write(<position>): <reason>` on the line above, where <position> is the literal `path` " +
  "— the object-literal property key.";

/** Legacy `scanRoot` was `p.startsWith("tests/")` — the `@tests` root exactly. */
const TESTS_POPULATION = { in: ["@tests"] } as const;

/** The options object a call was handed, following a stable binding so a hoisted options const is the same
 *  argument. Never a descendant sweep — one delivered node, resolved through the shared reader. */
function optionsObject(argument: MorphNode): MorphNode | null {
  // A bag whose MEMBERS are written after construction is assembled, not authored — its `path` at the call
  // site is not the value that reaches disk, so following the binding would be a guess.
  if (Node.isIdentifier(argument) && inspectReferenceWrites(argument).kind === "unresolved") {
    return null;
  }
  const stable = resolveStableExpression(argument);
  const terminal = stable.kind === "resolved" ? stable.value : argument;
  return Node.isObjectLiteralExpression(terminal) ? terminal : null;
}

/** The `path` key nodes of one options object whose authored value carries the `reports/` needle. */
function needlePathKeys(options: MorphNode): readonly MorphNode[] {
  if (!Node.isObjectLiteralExpression(options)) {
    return [];
  }
  const keys: MorphNode[] = [];
  for (const property of options.getProperties()) {
    if (!Node.isPropertyAssignment(property) || propertyAssignmentName(property) !== PATH_KEY) {
      continue;
    }
    const initializer = property.getInitializer();
    const text = initializer === undefined ? null : readStaticTextOf(initializer);
    if (text !== null && text.includes(NEEDLE)) {
      keys.push(property.getNameNode());
    }
  }
  return keys;
}

export const gate = defineGate({
  id: "no-direct-reports-write",
  family: "no-direct-reports-write",
  authority: "ordinary",
  severity: "error",
  population: TESTS_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node) => {
          if (!Node.isCallExpression(node)) {
            return;
          }
          const callee = readMemberReference(node.getExpression());
          if (callee.kind !== "resolved" || callee.value.name !== SCREENSHOT) {
            return;
          }
          const argument = node.getArguments()[0];
          const options = argument === undefined ? null : optionsObject(argument);
          if (options === null) {
            return;
          }
          for (const key of needlePathKeys(options)) {
            ctx.report.node(key, { token: PATH_KEY, offset: key.getText().indexOf(PATH_KEY) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "tests/ui/plain.ct.tsx":
          'export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: "reports/snaps/x.png" });\n}\n',
      },
      expect: { count: 1, token: "path" },
      why: "the founding shape — a hand-spelled `reports/snaps/…` literal that followed a published symlink and rewrote a finished run (#1201, live at tracker-blocks.ct.tsx:833)",
    },
    {
      mode: "types",
      files: {
        "tests/ui/template.ct.tsx":
          "export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }, name: string): Promise<void> {\n  await page.screenshot({ path: `reports/ct-shots/${name}.png` });\n}\n",
      },
      expect: { count: 1, token: "path" },
      why: "the same defect as a TEMPLATE — the quasis still carry the `reports/` text even though the filename segment is interpolated, and the interpolation itself is deliberately not read as authored text",
    },
    {
      mode: "types",
      files: {
        "tests/ui/indirect.ct.tsx":
          'const OUT = "reports/snaps/x.png";\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: OUT });\n}\n',
      },
      expect: { count: 1, token: "path" },
      why: "THE HELPER INDIRECTION the legacy reader declared out of reach: a `reports/…` value one binding hop away is the same write. The shared static reader follows the const, so hoisting the string is no longer an escape",
    },
    {
      mode: "types",
      files: {
        "tests/ui/computed.ct.tsx":
          'export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ ["path"]: "reports/snaps/x.png" });\n}\n',
      },
      expect: { count: 1, token: "path" },
      why: 'a COMPUTED key names the same option — `prop.getName()` answered `["path"]` and the legacy comparison said no',
    },
    {
      mode: "types",
      files: {
        "tests/ui/bracket-call.ct.tsx":
          'export async function x(page: Record<string, (o: unknown) => Promise<unknown>>): Promise<void> {\n  await page["screenshot"]({ path: "reports/snaps/x.png" });\n}\n',
      },
      expect: { count: 1, token: "path" },
      why: "the BRACKET spelling of the method is the same write — the legacy `callee.getName()` guard was offered an ElementAccessExpression and answered nothing (#1506)",
    },
    {
      mode: "types",
      files: {
        "tests/ui/hoisted-options.ct.tsx":
          'const OPTIONS = { path: "reports/snaps/x.png" };\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot(OPTIONS);\n}\n',
      },
      expect: { count: 1, token: "path" },
      why: "the OPTIONS OBJECT held in a const — the legacy reader required an object literal AT the call site, so hoisting the whole options bag walked past it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tests/ui/mutated-options.ct.tsx":
          'export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }, name: string): Promise<void> {\n  const options: { path: string } = { path: "reports/snaps/x.png" };\n  options.path = name;\n  await page.screenshot(options);\n}\n',
      },
      why: "A MEMBER-MUTATED OPTIONS BAG is assembled, not authored — the `path` visible at construction is not the value that reaches disk, so following the binding would be a guess in the accusing direction",
    },
    {
      mode: "types",
      files: {
        "tests/ui/via-helper.ct.tsx":
          'declare function ctSnapPath(name: string): string;\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: ctSnapPath("x") });\n}\n',
      },
      why: "the SANCTIONED door — `ctSnapPath(name)` resolves at runtime, so there is no authored path to follow into a published pointer",
    },
    {
      mode: "types",
      files: {
        "tests/ui/clip-only.ct.tsx":
          "export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } });\n}\n",
      },
      why: "an in-memory clip screenshot with no `path` key never writes to disk — nothing to follow",
    },
    {
      mode: "types",
      files: {
        "tests/ui/elsewhere.ct.tsx":
          'export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: "artifacts/local/x.png" });\n}\n',
      },
      why: "a path OUTSIDE `reports/` writes nowhere a published pointer can reach — the subject is the evidence tree, not screenshots",
    },
    {
      mode: "types",
      files: {
        "tests/ui/via-variable.ct.tsx":
          "declare const someVar: string;\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: someVar });\n}\n",
      },
      why: "DECLARED LIMIT — a path whose value is genuinely dynamic (a parameter, a call result) carries no authored text at all. The reader refuses rather than guessing, and this policy remains about the authored shape",
    },
    {
      mode: "types",
      files: {
        "tests/ui/interpolated-needle.ct.tsx":
          "declare const dir: string;\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: `${dir}/x.png` });\n}\n",
      },
      why: "the needle inside an INTERPOLATION is not authored text — a `dir` that happens to hold `reports/` at runtime is a dataflow fact, and reading the hole as static text would be a confident false positive",
    },
    {
      mode: "types",
      files: {
        "tests/ui/waived.ct.tsx":
          '// @orb-waive no-direct-reports-write(path): this spec writes the run-slot fixture the pointer publisher itself is tested against; ends when the publisher takes an injected root.\nexport async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ path: "reports/snaps/x.png" });\n}\n',
      },
      why: "the ONE central positioned waiver naming the exact reported key — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
    },
    {
      mode: "types",
      files: {
        "tests/ui/other-method.ct.tsx":
          'export async function x(page: { snapshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.snapshot({ path: "reports/snaps/x.png" });\n}\n',
      },
      why: "DECLARED LIMIT, and the receipt for the METHOD name — a same-shaped `snapshot({ path })` call carrying the identical `reports/` literal. The §3.7 defect is specifically the PLAYWRIGHT screenshot write, whose sanctioned door is `ctSnapPath`; every other method that happens to take a `path` option has its own door and its own reviewer. Widening the method to any resolved callee reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "tests/ui/other-key.ct.tsx":
          'export async function x(page: { screenshot: (o: unknown) => Promise<unknown> }): Promise<void> {\n  await page.screenshot({ outputPath: "reports/snaps/x.png" });\n}\n',
      },
      why: "DECLARED LIMIT, and the receipt for the KEY name — the same `reports/` literal under a key that is NOT `path`. Only `path` names the file Playwright writes; a differently-keyed option carrying the same text is data the call never opens. Widening the key to any property reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "tests/ui/wrapper-arity.ct.tsx":
          'declare const target: unknown;\nexport async function x(capture: { screenshot: (t: unknown, o: unknown) => Promise<unknown> }): Promise<void> {\n  await capture.screenshot(target, { path: "reports/snaps/x.png" });\n}\n',
      },
      why: "DECLARED LIMIT, and the receipt for the ARGUMENT POSITION — a same-named WRAPPER whose signature is `(target, options)`, so the `reports/` bag is the second argument. The subject is Playwright's `screenshot(options)` shape, where the options bag is argument ZERO; reading `.at(-1)` instead would make every trailing object literal in a same-named call the options bag. Widening the position reds this row (w9 :262, #2046)",
    },
  ],
});
