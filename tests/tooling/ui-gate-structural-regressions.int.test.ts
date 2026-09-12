// Adversarial pins for structural UI/CT gate bypasses. These examples live outside the descriptors so
// the RED-FIRST proof compiles against the old gate source and fails on behavior, not a new gate API.
import { gate as derivesGate } from "../../tooling/src/verify/gates/baseui-derives-not-respells.ts";
import { gate as portalGate } from "../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
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

// evaluate-no-scope-capture migrated off the old `GateDescriptor` + `failuresFor` shape at its #1584
// conversion. Its cross-module ARM-B case — an imported callback checked in its DECLARING module — is now
// its own `mustFlag[2]`, run through `verifyPolicyProofs` on the static bar and pinned again in
// `tests/tooling/verify/gates/callback-provenance-family.test.ts`, which also carries the §4.5 tool-error
// refusals and the §4.2 identity arm that a proof row cannot express.

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

// ct-no-oneshot-live-read-assert and ct-story-single-import migrated off the old `GateDescriptor` +
// `failuresFor` shape at the gate-runtime-standardization.md conversion (#1935). Both are now `defineGate`
// policies whose OWN `mustFlag`/`mustPass` rows carry every case that was pinned here — symbol identity
// across test scopes, taint-through-transform, and the bare two-JSX-siblings collision — proven through
// `verifyPolicyProofs` in `tests/tooling/verify/gates/ct-no-oneshot-live-read-assert.test.ts` and
// `tests/tooling/verify/gates/ct-story-single-import.test.ts`. The ONESHOT-OK marker-mechanics proof
// (malformed/stale/adjacency/two-sidedness) is RETIRED entirely: that gate's bespoke escape parser is gone,
// replaced by the one central `@orb-waive` engine, whose own reconciliation tests
// (`tooling/src/verify/contract/ordinary-waiver.ts` consumers) are the successor for that behavior class —
// no per-gate marker-mechanics proof is owed any more.

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
