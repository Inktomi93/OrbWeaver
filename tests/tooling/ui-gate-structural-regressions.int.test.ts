// Adversarial pins for structural UI/CT gate bypasses. These examples live outside the descriptors so
// the RED-FIRST proof compiles against the old gate source and fails on behavior, not a new gate API.
import { gate as derivesGate } from "../../tooling/src/verify/gates/baseui-derives-not-respells.ts";
import { gate as portalGate } from "../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
import { gate as oneshotGate } from "../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { gate as storyGate } from "../../tooling/src/verify/gates/ct-story-single-import.ts";
import { gate as fabricationGate } from "../../tooling/src/verify/gates/no-test-fabrication.ts";
import { gate as focusGate } from "../../tooling/src/verify/gates/surface-a11y-focus.ts";
import { gate as containerGate } from "../../tooling/src/verify/gates/surface-in-a-container.ts";
import type { GateDescriptor, GateExample } from "../../tooling/src/verify/index.ts";
import { verifyGateProofs } from "../../tooling/src/verify/index.ts";
import { expect, test } from "../support/tool-fixtures.ts";

function failuresFor(gate: GateDescriptor, examples: readonly GateExample[]): ReturnType<typeof verifyGateProofs> {
  return verifyGateProofs([{ ...gate, mustFlag: examples, mustPass: [] }]);
}

const MANIFEST = {
  "tooling/src/verify/gates/baseui-surface.manifest.json":
    '{ "version": "9.9.9", "components": { "Select": { "module": "@base-ui/react/select", "namespaced": true, "parts": { "Root": { "kind": "part", "symbol": "SelectRoot", "from": "./root/SelectRoot.js", "props": ["items"], "handlers": {}, "inherits": [], "disposition": "exposed", "why": "" } } } } }\n',
} as const;

test("portal container={undefined} is a dead wire", () => {
  expect(
    failuresFor(portalGate, [
      {
        files:
          'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface PopupProps { container?: unknown }\nexport const P = () => <BaseDialog.Portal container={undefined} />;\n',
        at: "packages/ui/src/primitives/dialog/probe.tsx",
        expect: { token: "container-not-wired" },
        why: "an explicitly undefined portal target behaves exactly like an omitted target",
      },
    ]),
  ).toEqual([]);
});

test("a lookalike type identifier is not a Base UI derivation", () => {
  expect(
    failuresFor(derivesGate, [
      {
        files: {
          ...MANIFEST,
          "packages/ui/src/primitives/select/probe.tsx":
            'import type { SelectRootProps } from "@base-ui/react/select";\nimport { Select as BaseSelect } from "@base-ui/react/select";\ntype NotSelectRootProps = { items?: readonly string[] };\nexport interface SealProps { items?: NotSelectRootProps["items"] }\nexport const Seal = (p: SealProps) => <BaseSelect.Root {...p} />;\n',
        },
        expect: { messageIncludes: "SECOND spelling" },
        why: "identifier identity, not a substring containing the imported type name, establishes derivation",
      },
    ]),
  ).toEqual([]);
});

test("only the local initialized by a mutable DOM read is one-shot", () => {
  expect(
    failuresFor(oneshotGate, [
      {
        files:
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("live", async ({ pane }) => {\n  const text = await pane.textContent();\n  expect(text).toBe("settled");\n});\ntest("static", () => {\n  const text = "settled";\n  expect(text).toBe("settled");\n});\n',
        at: "tests/ui/pane.ct.tsx",
        expect: { count: 1, messageIncludes: "MUTABLE ASYNC" },
        why: "symbol identity matters: the live-read local is flagged while a same-named local in another test scope stays clean",
      },
    ]),
  ).toEqual([]);
});

test("one imported story rendered twice as JSX collides", () => {
  expect(
    failuresFor(storyGate, [
      {
        files: 'import { Story } from "./_ct-stories.tsx";\nexport const Cases = () => <>\n  <Story />\n  <Story />\n</>;\n',
        at: "tests/ui/story.ct.tsx",
        expect: { token: "Story" },
        why: "two JSX rewrite sites collide even when no array carries the component",
      },
    ]),
  ).toEqual([]);
});

test("FABRICATION-OK is reasoned, block-scoped, and two-sided", () => {
  expect(
    failuresFor(fabricationGate, [
      {
        files: "// FABRICATION-OK\nexport const x = {} as Widget;\n",
        at: "tests/tooling/bare.test.ts",
        expect: { messageIncludes: "FABRICATION-OK" },
        why: "a bare marker exempts nothing",
      },
      {
        files: "// FABRICATION-OK: invalid-input probe\nexport const x = 1;\n",
        at: "tests/tooling/stale.test.ts",
        expect: { messageIncludes: "stale" },
        why: "a reasoned marker guarding no fabrication is stale",
      },
      {
        files: "// FABRICATION-OK: first invalid-input probe only\nexport const x = [{} as Widget, {} as Widget];\n",
        at: "tests/tooling/over-cover.test.ts",
        expect: { count: 1, messageIncludes: "literal" },
        why: "one marker is consumed by one guarded cast and cannot over-cover its sibling",
      },
      {
        files: 'export const marker = "// FABRICATION-OK: not a comment";\nexport const x = {} as Widget;\n',
        at: "tests/tooling/string-marker.test.ts",
        expect: { count: 1, messageIncludes: "literal" },
        why: "the marker vocabulary inside a string is inert and cannot exempt a later cast",
      },
    ]),
  ).toEqual([]);
});

test("focus-like text is not a focus call", () => {
  expect(
    failuresFor(focusGate, [
      {
        files: {
          "packages/client/src/features/x/surfaces/pane.tsx": 'export const Pane = () => <div>{"call ref.focus() after mount"}</div>;\n',
        },
        expect: { messageIncludes: "focus restoration" },
        why: "a string spelling .focus( does not manage DOM focus",
      },
    ]),
  ).toEqual([]);
});

test("container-like text is not a rendered container", () => {
  expect(
    failuresFor(containerGate, [
      {
        files: {
          "packages/client/src/features/x/surfaces/pane.tsx": 'export const Pane = () => <div>{"wrap with <Container> later"}</div>;\n',
        },
        expect: { messageIncludes: "no <Container>" },
        why: "a string spelling a Container tag does not establish containment",
      },
    ]),
  ).toEqual([]);
});
