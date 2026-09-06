// The Base UI surface READER's own proof — the half `gate-conformance` structurally cannot reach.
//
// Conformance proves that `baseui-surface-manifest` REPORTS a blind part. It cannot prove that the
// GENERATOR refuses to write a manifest it has gone blind on, because the generator is a script, not a
// gate. That refusal is the load-bearing half: a manifest written from a reader that learned nothing hands
// every downstream `baseui-*` gate a confident false green, and nothing downstream can tell.
//
// This is not hypothetical. The reader's first depth ceiling (8) truncated `ComboboxRootProps` — an alias
// of `Omit<AriaCombobox.Props<…>, …> & { … }` that takes ten hops to walk — and reported `Combobox.Root` as
// having 14 props when it has 44, silently, on the one component docs/history/design/baseui-crunch.md item 6 is
// about. It was caught by cross-checking a prop known to exist (`items`), not by any instrument. These
// tests are that cross-check, made permanent.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import type { SurfaceManifest } from "../../../../tooling/src/verify/index.ts";
import {
  BASE_UI_MANIFEST_REL,
  BASE_UI_PKG_REL,
  blindParts,
  readInstalledSurface,
  resetBaseUiSurfaceCache,
  truncatedParts,
} from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Three cases SPAWN the real generator CLI (`verify baseline baseui-surface`) over a scratch tree, paying
// a real `node` boot + ts-morph import — measured 2.7-6.9s even on a near-quiet box (per-core 0.93, no
// contention scaling in force), well past vitest's 5s DEFAULT (#1248). Declared explicitly so this file
// never depends on inheriting the ambient default.
vi.setConfig({ testTimeout: scaledBudget(20_000), hookTimeout: scaledBudget(20_000) });

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
// The generator is a cli VERB now (`cli.ts baseline baseui-surface`), never a runnable file — the tool
// has ONE argv front door (docs/architecture/core/Core-Tooling-Law.md §2.5).
const VERIFY_CLI = join(REPO_ROOT, "tooling", "src", "verify", "cli.ts");
const GENERATOR_ARGV: readonly string[] = [VERIFY_CLI, "baseline", "baseui-surface"];

let root = "";

function write(rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

/** A synthetic installed package: one namespaced component whose Root props are only reachable through the
 *  SAME shape the real `Combobox.Root` uses — an alias of `Omit<Namespaced.Props<…>, …> & { … }`. A reader
 *  that stops at type literals, or gives up part-way down the alias chain, sees a fraction of these. */
function writeSyntheticPackage(): void {
  write(`${BASE_UI_PKG_REL}/package.json`, '{ "version": "9.9.9" }\n');
  write(`${BASE_UI_PKG_REL}/combobox/index.d.ts`, 'export * as Combobox from "./index.parts.js";\n');
  write(`${BASE_UI_PKG_REL}/combobox/index.parts.d.ts`, 'export { ComboboxRoot as Root } from "./root/ComboboxRoot.js";\n');
  write(
    `${BASE_UI_PKG_REL}/combobox/root/Aria.d.ts`,
    "interface AriaBase {\n  items?: readonly string[] | undefined;\n  disabled?: boolean | undefined;\n  fillInputOnItemPress?: boolean | undefined;\n}\n" +
      "export type AriaProps = AriaBase & {\n  selectionMode?: string | undefined;\n};\n" +
      "export declare namespace Aria {\n  type Props = AriaProps;\n}\nexport declare const Aria: unknown;\n",
  );
  write(
    `${BASE_UI_PKG_REL}/combobox/root/ComboboxRoot.d.ts`,
    'import { Aria } from "./Aria.js";\n' +
      "export type ComboboxRootProps = Omit<Aria.Props, 'fillInputOnItemPress' | 'selectionMode'> & {\n" +
      "  onValueChange?: ((value: string, eventDetails: unknown) => void) | undefined;\n};\n" +
      "export interface ComboboxRootState {\n  open: boolean;\n}\n",
  );
}

const COMPONENT = "Combobox";
const PART = "Root";

/** Read the manifest the generator just wrote. */
function readLedger(): SurfaceManifest {
  return JSON.parse(readFileSync(join(root, BASE_UI_MANIFEST_REL), "utf8")) as SurfaceManifest;
}

/** Re-rule one part in place and write the ledger back — the human edit the generator must respect. */
function rerule(disposition: string, why: string): void {
  const ledger = readLedger();
  const part = ledger.components[COMPONENT]?.parts[PART];
  if (part === undefined) {
    throw new Error(`no ${COMPONENT}.${PART} in the generated ledger`);
  }
  const mutable = part as { disposition: string; why: string };
  mutable.disposition = disposition;
  mutable.why = why;
  writeFileSync(join(root, BASE_UI_MANIFEST_REL), JSON.stringify(ledger, null, 2));
}

/** The disposition currently recorded for the probe part. */
function ruling(): { disposition: string; why: string } | undefined {
  return readLedger().components[COMPONENT]?.parts[PART];
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "orb-baseui-reader-"));
  resetBaseUiSurfaceCache();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  resetBaseUiSurfaceCache();
});

test("the reader walks a Props type through alias → intersection → Omit → namespace, not just type literals", () => {
  writeSyntheticPackage();
  const surface = readInstalledSurface(root);
  const rootPart = surface?.components["Combobox"]?.parts["Root"];
  // `items`/`disabled` are only reachable through the Omit of a namespaced alias of an intersection whose
  // left arm is a separate interface — the exact shape that returned 14-of-44 under the first depth cap.
  expect(rootPart?.props).toEqual(["disabled", "items", "onValueChange"]);
  // The handler's ARITY is what makes eventDetails-stripping detectable without a type checker.
  expect(rootPart?.handlers).toEqual({ onValueChange: 2 });
  // `<Part>State` is read too — it IS the set of data-* attributes the part stamps on the DOM.
  expect(rootPart?.state).toEqual(["open"]);
  expect(blindParts(surface ?? { version: "", components: {} })).toEqual([]);
  expect(truncatedParts(surface ?? { version: "", components: {} })).toEqual([]);
});

test("a part whose Props type the reader cannot walk is reported BLIND, never silently empty", () => {
  write(`${BASE_UI_PKG_REL}/package.json`, '{ "version": "9.9.9" }\n');
  write(`${BASE_UI_PKG_REL}/widget/index.d.ts`, 'export * as Widget from "./index.parts.js";\n');
  write(`${BASE_UI_PKG_REL}/widget/index.parts.d.ts`, 'export { WidgetRoot as Root } from "./root/WidgetRoot.js";\n');
  // A Props type that resolves to nothing the expander can read AND names no heritage arm to record.
  write(`${BASE_UI_PKG_REL}/widget/root/WidgetRoot.d.ts`, "export type WidgetRootProps = {};\n");
  const surface = readInstalledSurface(root);
  expect(blindParts(surface ?? { version: "", components: {} })).toEqual(["Widget.Root"]);
});

test("readInstalledSurface returns undefined when the package is absent — the caller must RED, not assume", () => {
  expect(readInstalledSurface(root)).toBeUndefined();
});

test("the generator REFUSES to write a manifest it cannot vouch for", () => {
  write(`${BASE_UI_PKG_REL}/package.json`, '{ "version": "9.9.9" }\n');
  write(`${BASE_UI_PKG_REL}/widget/index.d.ts`, 'export * as Widget from "./index.parts.js";\n');
  write(`${BASE_UI_PKG_REL}/widget/index.parts.d.ts`, 'export { WidgetRoot as Root } from "./root/WidgetRoot.js";\n');
  write(`${BASE_UI_PKG_REL}/widget/root/WidgetRoot.d.ts`, "export type WidgetRootProps = {};\n");
  let code = 0;
  let stderr = "";
  try {
    execFileSync("node", [...GENERATOR_ARGV], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    code = e.status ?? -1;
    stderr = e.stderr ?? "";
  }
  expect(code).toBe(2);
  expect(stderr).toContain("learned nothing about: Widget.Root");
  // The refusal is TOTAL: nothing was written, so a blind run cannot leave a half-true ledger behind.
  expect(() => readFileSync(join(root, BASE_UI_MANIFEST_REL), "utf8")).toThrow();
});

test("the generator seeds a new part `unresolved` and never carries that non-ruling forward", () => {
  writeSyntheticPackage();
  execFileSync("node", [...GENERATOR_ARGV], { cwd: root, encoding: "utf8" });
  // Nothing in this tree renders the part, and nothing wraps the component — so `n-a` is the honest seed.
  expect(ruling()?.disposition).toBe("n-a");

  // Now a seal DOES wrap it. Re-running must re-seed: a part that has since been wired cannot stay stuck at
  // "nobody has decided" (the defect that left Menu.Viewport / Toolbar.Group unresolved after the seals
  // started rendering them).
  write(
    "packages/ui/src/primitives/probe/probe.tsx",
    'import { Combobox as BaseCombobox } from "@base-ui/react/combobox";\nexport const S = () => <BaseCombobox.Root />;\n',
  );
  rerule("unresolved", "");
  execFileSync("node", [...GENERATOR_ARGV], { cwd: root, encoding: "utf8" });
  expect(ruling()?.disposition).toBe("exposed");
});

test("a RULED disposition survives regeneration verbatim — the ledger is not re-derived, only extended", () => {
  writeSyntheticPackage();
  execFileSync("node", [...GENERATOR_ARGV], { cwd: root, encoding: "utf8" });
  const ruled = "deliberate: this seal has no popup. Ends when it grows one.";
  rerule("sealed-away", ruled);
  execFileSync("node", [...GENERATOR_ARGV], { cwd: root, encoding: "utf8" });
  expect(ruling()).toMatchObject({ disposition: "sealed-away", why: ruled });
});
