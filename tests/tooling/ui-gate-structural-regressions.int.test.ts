// Adversarial pins for structural UI/CT gate bypasses. These examples live outside the descriptors so
// the RED-FIRST proof compiles against the old gate source and fails on behavior, not a new gate API.
import { gate as derivesGate } from "../../tooling/src/verify/gates/baseui-derives-not-respells.ts";
import { gate as portalGate } from "../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
import { gate as oneshotGate } from "../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { gate as storyGate } from "../../tooling/src/verify/gates/ct-story-single-import.ts";
import { gate as evaluateGate } from "../../tooling/src/verify/gates/evaluate-no-scope-capture.ts";
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

test("portal wiring belongs to the owning callable and actual Base UI target", () => {
  expect(
    verifyGateProofs([
      {
        ...portalGate,
        mustFlag: [
          {
            files:
              'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface PopupProps { container?: unknown }\nexport const P = (_props: PopupProps) => <BaseDialog.Portal container={document.body} />;\n',
            at: "packages/ui/src/primitives/dialog/document-body.tsx",
            expect: { token: "container-not-wired" },
            why: "document.body ignores the owning callable's container prop and recreates Base UI's unsafe default",
          },
          {
            files:
              'import { Dialog as BaseDialog } from "@base-ui/react/dialog";\nexport interface PopupProps { container?: unknown }\nexport const P = (_props: PopupProps) => <BaseDialog.Portal container={portalContainer} />;\n',
            at: "packages/ui/src/primitives/dialog/ignored-prop.tsx",
            expect: { token: "container-not-wired" },
            why: "a declared prop that never contributes to the actual Portal target is a dead caller seam",
          },
        ],
        mustPass: [
          {
            files:
              "export interface PopupProps { container?: unknown }\nconst Local = { Portal: (_p: PopupProps) => null };\nexport const P = ({ container }: PopupProps) => <Local.Portal container={document.body ?? container} />;\n",
            at: "packages/ui/src/primitives/dialog/lookalike.tsx",
            why: "a local object named Portal is not the imported Base UI portal target this seal gate governs",
          },
        ],
      },
    ]),
  ).toEqual([]);
});

test("an imported evaluate callback is checked in its declaring module", () => {
  expect(
    failuresFor(evaluateGate, [
      {
        files: {
          "tooling/src/snap/ops/callback.ts":
            'const MARK = "data-mark";\nexport function mark(el: { setAttribute(name: string, value: string): void }): void { el.setAttribute(MARK, "1"); }\n',
          "tooling/src/snap/ops/caller.ts":
            'import { mark } from "./callback.ts";\nexport async function run(page: { evaluate(fn: unknown): Promise<void> }): Promise<void> { await page.evaluate(mark); }\n',
        },
        expect: { count: 1, token: "MARK" },
        why: "Playwright serializes an imported callback too; its declaring module constant is absent in the browser",
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

test("click-only focus does not establish arrival focus", () => {
  expect(
    failuresFor(focusGate, [
      {
        files: {
          "packages/client/src/features/x/surfaces/pane.tsx": "export const Pane = () => <button onClick={() => ref.current?.focus()}>Open</button>;\n",
        },
        expect: { messageIncludes: "focus restoration" },
        why: "focus reached only after a click is not mount/lifecycle focus restoration",
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

test("only an imported @orb/ui layout container establishes containment", () => {
  expect(
    verifyGateProofs([
      {
        ...containerGate,
        mustFlag: [
          {
            files: {
              "packages/client/src/features/x/surfaces/local.tsx":
                "const Container = ({ children }: { children: unknown }) => <div>{children}</div>;\nexport const Pane = () => <Container><main>content</main></Container>;\n",
            },
            expect: { messageIncludes: "no <Container>" },
            why: "a local Container lookalike does not provide @orb/ui container-query containment",
          },
          {
            files: {
              "packages/client/src/features/x/surfaces/section.tsx":
                'import { Section } from "@orb/ui/layout";\nexport const Pane = () => <Section><main>content</main></Section>;\n',
            },
            expect: { messageIncludes: "no <Container>" },
            why: "@orb/ui Section is a container only when its container prop opts into container-type",
          },
        ],
        mustPass: [
          {
            files: {
              "packages/client/src/features/x/surfaces/aliased.tsx":
                'import { Container as LayoutContainer } from "@orb/ui/layout";\nexport const Pane = () => <LayoutContainer><main>content</main></LayoutContainer>;\n',
            },
            why: "the imported symbol identity survives a local alias",
          },
        ],
      },
    ]),
  ).toEqual([]);
});

test("one-shot taint survives property access and value transforms", () => {
  expect(
    failuresFor(oneshotGate, [
      {
        files:
          'import { expect, test } from "@playwright/experimental-ct-react";\ntest("box", async ({ pane }) => {\n  const box = await pane.boundingBox();\n  expect(box?.width).toBeGreaterThan(0);\n});\ntest("text", async ({ pane }) => {\n  const text = (await pane.textContent())?.trim().toLowerCase();\n  expect(text).toBe("ready");\n});\n',
        at: "tests/ui/taint.ct.tsx",
        expect: { count: 2, messageIncludes: "MUTABLE ASYNC" },
        why: "property selection and pure transforms do not settle the mutable DOM snapshot",
      },
    ]),
  ).toEqual([]);
});

test("ONESHOT-OK is reasoned, adjacent, single-use, and two-sided", () => {
  expect(
    failuresFor(oneshotGate, [
      {
        files:
          'import { expect } from "@playwright/experimental-ct-react";\nconst text = await pane.textContent();\n// ONESHOT-OK\nexpect(text).toBe("ready");\n',
        at: "tests/ui/malformed.ct.tsx",
        expect: { messageIncludes: "malformed" },
        why: "a marker without a concrete reason exempts nothing",
      },
      {
        files:
          'import { expect } from "@playwright/experimental-ct-react";\n// ONESHOT-OK: settled by the preceding web-first assertion\nexpect("ready").toBe("ready");\n',
        at: "tests/ui/stale.ct.tsx",
        expect: { messageIncludes: "stale" },
        why: "a valid marker beside no one-shot consumption is stale",
      },
      {
        files:
          'import { expect } from "@playwright/experimental-ct-react";\nconst first = await pane.textContent();\nconst second = await pane.innerText();\n// ONESHOT-OK: both reads are settled\nexpect(first).toBe("ready"); expect(second).toBe("ready");\n',
        at: "tests/ui/single-use.ct.tsx",
        expect: { count: 1, messageIncludes: "MUTABLE ASYNC" },
        why: "one adjacent marker is consumed by exactly one assertion and cannot absolve its sibling",
      },
      {
        files:
          'import { expect } from "@playwright/experimental-ct-react";\nconst text = await pane.textContent();\n// ONESHOT-OK: settled elsewhere\n\nexpect(text).toBe("ready");\n',
        at: "tests/ui/nonadjacent.ct.tsx",
        expect: { count: 2 },
        why: "a blank line breaks adjacency: the assertion remains live-read RED and the marker is stale",
      },
    ]),
  ).toEqual([]);
});
