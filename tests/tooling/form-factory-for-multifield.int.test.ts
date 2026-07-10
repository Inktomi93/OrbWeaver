// Self-test for the DORMANT `form-factory-for-multifield` gate
// (scripts/check/gates/form-factory-for-multifield.ts — not in report.ts's ALL_CHECKS). Drives the gate
// directly (never via report.ts/ALL_CHECKS, since it isn't wired there) over an in-memory ts-morph
// project of SYNTHETIC fixtures — never the real tree. `.int.test.ts` matches this repo's gate
// self-test precedent (audit-client-tests.int.test.ts); the fixtures here are pure in-memory.
import { join } from "node:path";
import { Project } from "ts-morph";
import { formFactoryForMultifield } from "../../scripts/check/gates/form-factory-for-multifield.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = "/repo";
const FEATURE_PATH = "packages/client/src/features/demo/components/thing.tsx";

function ctxFor(text: string, path = FEATURE_PATH): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(join(ROOT, path), text);
  return { root: ROOT, project };
}

function hits(ctx: CheckContext): string[] {
  return formFactoryForMultifield.run(ctx).map((v) => v.message);
}

const controlled = (tag: string): string => `<${tag} value={v} onValueChange={set} />`;

// ── Fires: ≥3 hand-rolled controlled inputs, no factory ──────────────────────────────────────────

test("fires on a component with 3 controlled inputs and no factory import", () => {
  const ctx = ctxFor(
    `export function ThingForm() {\n  return (\n    <div>\n      ${controlled("Input")}\n      ${controlled("Select")}\n      <Switch checked={c} onCheckedChange={set} />\n    </div>\n  );\n}\n`,
  );
  expect(hits(ctx).length).toBe(1);
});

test("fires on raw controlled input/textarea/select tags too", () => {
  const ctx = ctxFor(
    "export function ThingForm() {\n  return (\n    <form>\n      <input value={a} onChange={set} />\n      <textarea value={b} onChange={set} />\n      <select value={c} onChange={set} />\n    </form>\n  );\n}\n",
  );
  expect(hits(ctx).length).toBe(1);
});

// ── Does NOT fire ────────────────────────────────────────────────────────────────────────────────

test("does NOT fire when the file imports createSavedEntityForm", () => {
  const ctx = ctxFor(
    `import { createSavedEntityForm } from "#forms";\nconst use = createSavedEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      ${controlled("Input")}\n      ${controlled("Select")}\n      ${controlled("NumberField")}\n    </div>\n  );\n}\n`,
  );
  expect(hits(ctx)).toEqual([]);
});

test("does NOT fire when the file imports createAutosaveEntityForm", () => {
  const ctx = ctxFor(
    `import { createAutosaveEntityForm } from "#forms";\nconst use = createAutosaveEntityForm({});\nexport function ThingForm() {\n  return (\n    <div>\n      ${controlled("Input")}\n      ${controlled("Select")}\n      ${controlled("NumberField")}\n    </div>\n  );\n}\n`,
  );
  expect(hits(ctx)).toEqual([]);
});

test("does NOT fire below the ≥3 threshold (a 2-field login is exempt)", () => {
  const ctx = ctxFor(
    "export function Login() {\n  return (\n    <form>\n      <Input value={u} onValueChange={set} />\n      <Input value={p} onValueChange={set} />\n    </form>\n  );\n}\n",
  );
  expect(hits(ctx)).toEqual([]);
});

test("does NOT count Tabs value/onValueChange (active-tab state, not a form field)", () => {
  const ctx = ctxFor(
    // biome-ignore lint/security/noSecrets: fixture SOURCE (repeated JSX Tabs markup), not a secret.
    "export function Panel() {\n  return (\n    <Tabs value={t} onValueChange={set}>\n      <Tabs value={t} onValueChange={set} />\n      <Tabs value={t} onValueChange={set} />\n      <Tabs value={t} onValueChange={set} />\n    </Tabs>\n  );\n}\n",
  );
  expect(hits(ctx)).toEqual([]);
});

test("does NOT count uncontrolled inputs (value present, no onChange handler)", () => {
  const ctx = ctxFor(
    "export function ReadOnly() {\n  return (\n    <div>\n      <Input value={a} />\n      <Input value={b} />\n      <Input value={c} />\n    </div>\n  );\n}\n",
  );
  expect(hits(ctx)).toEqual([]);
});

test("counts per component — two separate 2-field components do not aggregate", () => {
  const ctx = ctxFor(
    `export function A() {\n  return (<div>${controlled("Input")}${controlled("Select")}</div>);\n}\nexport function B() {\n  return (<div>${controlled("Input")}${controlled("Select")}</div>);\n}\n`,
  );
  expect(hits(ctx)).toEqual([]);
});

// ── Scope ────────────────────────────────────────────────────────────────────────────────────────

test("ignores files outside packages/client/src/features/**", () => {
  const ctx = ctxFor(
    `export function ThingForm() {\n  return (\n    <div>\n      ${controlled("Input")}\n      ${controlled("Select")}\n      ${controlled("NumberField")}\n    </div>\n  );\n}\n`,
    "packages/ui/src/primitives/thing/thing.tsx",
  );
  expect(hits(ctx)).toEqual([]);
});

test("ignores non-.tsx feature files", () => {
  const ctx = ctxFor(
    "export const x = 1;\n",
    "packages/client/src/features/demo/hooks/use-thing.ts",
  );
  expect(hits(ctx)).toEqual([]);
});
