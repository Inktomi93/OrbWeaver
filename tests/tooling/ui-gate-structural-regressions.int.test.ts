// Adversarial pins for structural UI/CT gate bypasses. These examples live outside the descriptors so
// the RED-FIRST proof compiles against the old gate source and fails on behavior, not a new gate API.
import { gate as derivesGate } from "../../tooling/src/verify/gates/baseui-derives-not-respells.ts";
import { gate as fabricationGate } from "../../tooling/src/verify/gates/no-test-fabrication.ts";
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

// baseui-portal-container-seam and surface-a11y-focus migrated off the old `GateDescriptor` +
// `failuresFor` shape at their #1584 conversion. Every case pinned here is now one of their OWN rows, run
// through `verifyPolicyProofs` on the static bar: the portal's `container={undefined}` dead wire, its
// `document.body` target and its IGNORED-PROP target are `baseui-portal-container-seam` mustFlag[4]/[2]/[5],
// and the local-`Local.Portal` lookalike is its mustPass[5]; the focus gate's STRING-spelled `.focus(` and
// its click-only handler are `surface-a11y-focus` mustFlag[3]/[2]. The §4.2 identity arms, the §4.5
// refusals and the real-tree marker translation live in
// `tests/tooling/verify/gates/baseui-and-surface-family.repo.int.test.ts`.
// `surface-in-a-container` converted in the same commit and its two blocks moved with it: the string-spelled
// `<Container>`, the LOCAL `Container` lookalike and the bare `<Section>` are its mustFlag[2]/[4]/[5], and the
// ALIASED `Container as LayoutContainer` import is its mustPass[6]. Its shell exemption's two-sided ratchet is
// now the `hard` `surface-in-a-container-health` policy.
//
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
