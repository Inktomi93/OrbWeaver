import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Linter } from "eslint";
import playwright from "eslint-plugin-playwright";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("a non-retrying expect() reading mutable async state in a CT is flagged, and a settled read is not", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

const ROOT = "/ct-no-oneshot-family";

function passOf(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

// ---------------------------------------------------------------------------------------------------
// REPORT IDENTITY, POSITIVE ARM. The gate's report supplies its own policy id and an "expect" position
// token — this proves what the mustFlag row can only assert indirectly: a marker naming THIS gate's own
// id at the exact reported position is bound by the central engine and suppresses the finding. (The
// wrong-policy / stale / malformed report-identity cases are the CENTRAL engine's own proof —
// `ordinary-waiver.test.ts` — proved once there; a per-gate negative arm here with only `[gate]` in
// `knownPolicies` made the named sibling `unknown-policy`, which is unreachable in production where the
// whole family is known, and was therefore vacuous — owner ruling 2026-09-11, #1935.)
// ---------------------------------------------------------------------------------------------------
test("an @orb-waive naming this gate's OWN id at the exact position suppresses the finding", () => {
  const waived = passOf({
    "tests/client/data/x.ct.tsx":
      'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — count polled to 2 above.\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("snapshot declaration identity survives imported aliases and mutable locals without following a same-named shadow", () => {
  const result = passOf({
    "tests/ui/snapshot.ts": "export const snapshot = document.activeElement;",
    "tests/ui/snapshot.ct.tsx":
      'import { snapshot as imported } from "./snapshot.ts"; expect(imported).toBe(null); let live = document.activeElement; expect(live).toBe(null); function other() { const live = null; expect(live).toBe(null); }',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(2);
});

test("an imported mutable snapshot retains its authored live-read taint", () => {
  const result = passOf({
    "tests/ui/mutable.ts": "export let snapshot = document.activeElement;",
    "tests/ui/mutable.ct.tsx": 'import { snapshot } from "./mutable.ts"; expect(snapshot).toBe(null);',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
});

// Run the installed maintained rules, not a test-side model of their selectors.
function nativeFindings(source: string): readonly string[] {
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.ct.tsx"],
      plugins: { playwright },
      rules: {
        "playwright/prefer-web-first-assertions": "error",
        "playwright/prefer-to-have-count": "error",
      },
    },
    { filename: "tests/ui/comparison.ct.tsx" },
  );
  expect(messages.filter((message) => message.fatal)).toEqual([]);
  return messages.map((message) => message.ruleId ?? "missing-rule");
}

const WEB_FIRST = "playwright/prefer-web-first-assertions";
const HAVE_COUNT = "playwright/prefer-to-have-count";

const comparisons = [
  { name: "inline text equality", source: 'expect(await pane.textContent()).toBe("ready");', gateCount: 1, native: [WEB_FIRST] },
  { name: "local text snapshot", source: 'const text = await pane.textContent(); expect(text).toBe("ready");', gateCount: 1, native: [WEB_FIRST] },
  { name: "mutable local text snapshot", source: 'let text = await pane.textContent(); expect(text).toBe("ready");', gateCount: 1, native: [WEB_FIRST] },
  {
    name: "alias of text snapshot",
    source: 'const text = await pane.textContent(); const alias = text; expect(alias).toBe("ready");',
    gateCount: 1,
    native: [],
  },
  { name: "pure transform of text snapshot", source: 'const text = (await pane.textContent())?.trim(); expect(text).toBe("ready");', gateCount: 1, native: [] },
  { name: "inline text containment", source: 'expect(await pane.textContent()).toContain("ready");', gateCount: 1, native: [] },
  { name: "inline locator count equality", source: "expect(await pane.count()).toBe(2);", gateCount: 1, native: [HAVE_COUNT] },
  { name: "locator count range", source: "expect(await pane.count()).toBeGreaterThan(1);", gateCount: 1, native: [] },
  { name: "synchronous recorder count", source: 'expect(trpc.count("tag.createTag")).toBe(2);', gateCount: 1, native: [] },
  { name: "recorder input selection", source: 'expect(trpc.requireLastInput("tag.createTag").name).toBe("ready");', gateCount: 1, native: [] },
  { name: "geometry selection", source: "expect((await pane.boundingBox())?.width).toBeGreaterThan(0);", gateCount: 1, native: [] },
  { name: "page evaluation", source: "expect(await page.evaluate(() => document.activeElement)).toBe(null);", gateCount: 1, native: [] },
  { name: "focus snapshot", source: "const focus = document.activeElement; expect(focus).toBe(null);", gateCount: 1, native: [] },
  {
    name: "same named clean shadow",
    source: 'const text = await pane.textContent(); expect(text).toBe("ready"); { const text = "ready"; expect(text).toBe("ready"); }',
    gateCount: 1,
    native: [WEB_FIRST],
  },
  { name: "imported snapshot alias", source: 'import { snapshot as text } from "./snapshot.ts"; expect(text).toBe("ready");', gateCount: 1, native: [] },
  { name: "reexported snapshot alias", source: 'import { renamed as text } from "./barrel.ts"; expect(text).toBe("ready");', gateCount: 1, native: [] },
  { name: "imported mutable snapshot", source: 'import { mutable as text } from "./snapshot.ts"; expect(text).toBe("ready");', gateCount: 1, native: [] },
  { name: "plain imported value", source: 'import { plain as text } from "./snapshot.ts"; expect(text).toBe("ready");', gateCount: 0, native: [] },
  { name: "polling the live read", source: 'await expect.poll(() => pane.textContent()).toBe("ready");', gateCount: 0, native: [] },
  { name: "web first locator assertion", source: 'await expect(pane).toHaveText("ready");', gateCount: 0, native: [] },
  { name: "plain value", source: 'const text = "ready"; expect(text).toBe("ready");', gateCount: 0, native: [] },
  { name: "native boolean read outside gate method set", source: "expect(await pane.isVisible()).toBe(true);", gateCount: 0, native: [WEB_FIRST] },
  {
    name: "imported assertion alias outside gate root",
    source: 'import { expect as check } from "@playwright/experimental-ct-react"; check(await pane.textContent()).toBe("ready");',
    gateCount: 0,
    native: [WEB_FIRST],
  },
  { name: "bracket method outside gate spelling", source: 'expect(await pane["textContent"]()).toBe("ready");', gateCount: 0, native: [WEB_FIRST] },
  {
    name: "destructured snapshot outside shared stable resolver",
    source: "const { width } = await pane.boundingBox(); expect(width).toBeGreaterThan(0);",
    gateCount: 0,
    native: [],
  },
  {
    name: "bound method outside both read recognizers",
    source: 'const read = pane.textContent.bind(pane); expect(await read()).toBe("ready");',
    gateCount: 0,
    native: [],
  },
];

test.each(comparisons)("maintained native comparison: $name", ({ source, gateCount, native }) => {
  const moduleSource = `import { expect } from "@playwright/experimental-ct-react"; ${source}`;
  const result = passOf({
    "tests/ui/snapshot.ts": 'export const snapshot = await pane.textContent(); export let mutable = document.activeElement; export const plain = "ready";',
    "tests/ui/barrel.ts": 'export { snapshot as renamed } from "./snapshot.ts";',
    "tests/ui/comparison.ct.tsx": moduleSource,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(gateCount);
  expect(nativeFindings(moduleSource)).toEqual(native);
});
