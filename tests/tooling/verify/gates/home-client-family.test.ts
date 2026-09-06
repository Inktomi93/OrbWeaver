// Conformance entry for the fourteen CLIENT-side policies whose exceptions were sanctioned HOMES. Every
// proof runs through the production dispatcher on an isolated population; the pins below cover what a proof
// cannot express — a receipt REFUSAL (a tool error, not a finding) and the central grant liveness these
// policies' whole authority rests on.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as boundFieldViaHook } from "../../../../tooling/src/verify/gates/bound-field-via-hook.ts";
import { gate as chatStreamWritesInBusOnly } from "../../../../tooling/src/verify/gates/chat-stream-writes-in-bus-only.ts";
import { gate as clientCacheSurgeryOnlyInData } from "../../../../tooling/src/verify/gates/client-cache-surgery-only-in-data.ts";
import { gate as noDirectUseform } from "../../../../tooling/src/verify/gates/no-direct-useform.ts";
import { gate as noEffectOnSharedSelection } from "../../../../tooling/src/verify/gates/no-effect-on-shared-selection.ts";
import { gate as noInlineInvalidateOutsideSeam } from "../../../../tooling/src/verify/gates/no-inline-invalidate-outside-seam.ts";
import { gate as noRawIntlTime } from "../../../../tooling/src/verify/gates/no-raw-intl-time.ts";
import { gate as noRawMatchmedia } from "../../../../tooling/src/verify/gates/no-raw-matchmedia.ts";
import { gate as noRawZustandPersist } from "../../../../tooling/src/verify/gates/no-raw-zustand-persist.ts";
import { gate as noUntrustedHtmlInMainDom } from "../../../../tooling/src/verify/gates/no-untrusted-html-in-main-dom.ts";
import { gate as registryContextViaMint } from "../../../../tooling/src/verify/gates/registry-context-via-mint.ts";
import { gate as renderErrorViaBattery } from "../../../../tooling/src/verify/gates/render-error-via-battery.ts";
import { gate as selectionStoreViaFactory } from "../../../../tooling/src/verify/gates/selection-store-via-factory.ts";
import { gate as themeOverrideOnlyViaScope } from "../../../../tooling/src/verify/gates/theme-override-only-via-scope.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FAMILY: readonly GatePolicy[] = [
  boundFieldViaHook,
  chatStreamWritesInBusOnly,
  clientCacheSurgeryOnlyInData,
  noDirectUseform,
  noEffectOnSharedSelection,
  noInlineInvalidateOutsideSeam,
  noRawIntlTime,
  noRawMatchmedia,
  noRawZustandPersist,
  noUntrustedHtmlInMainDom,
  registryContextViaMint,
  renderErrorViaBattery,
  selectionStoreViaFactory,
  themeOverrideOnlyViaScope,
];

test("the sanctioned-home client policies keep their founding, permission, respelling and counterfactual fixtures", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
}, 240_000);

const ROOT = "/home-client-family";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(
  policy: GatePolicy,
  files: Readonly<Record<string, string>>,
  grants: Parameters<typeof runPolicyPass>[0]["reviewedGrants"] = [],
): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: grants, failOnWarnings: false });
}

/** Every relative specifier a single proof row authored, paired with whether it reached a file. */
function unresolvedSpecifiers(proof: { readonly files: Readonly<Record<string, string>> }): {
  readonly checked: number;
  readonly unresolved: readonly string[];
} {
  const project = projectOf(proof.files);
  const unresolved: string[] = [];
  let checked = 0;
  for (const sourceFile of project.getSourceFiles()) {
    for (const declaration of sourceFile.getImportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (!specifier.startsWith(".")) {
        continue;
      }
      checked += 1;
      if (declaration.getModuleSpecifierSourceFile() === undefined) {
        unresolved.push(`${sourceFile.getFilePath()} -> ${specifier}`);
      }
    }
  }
  return { checked, unresolved };
}

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL. A proof row's relative import that resolves to NOTHING makes
// every identity row pass by FAIL-CLOSURE while conformance still reports green — the lying-proof shape the
// wave-3 lanes paid for. Every relative specifier in every row of this family must reach a file in the
// row's own map.
// ---------------------------------------------------------------------------------------------------
test("every relative import in every proof of this family resolves inside the proof's own file map", () => {
  const unresolved: string[] = [];
  let checked = 0;
  for (const policy of FAMILY) {
    for (const arm of ["mustFlag", "mustPass"] as const) {
      for (const [index, proof] of policy[arm].entries()) {
        const measured = unresolvedSpecifiers(proof);
        checked += measured.checked;
        unresolved.push(...measured.unresolved.map((detail) => `${policy.id} ${arm}[${index}] ${detail}`));
      }
    }
  }
  expect(unresolved).toEqual([]);
  // A bare zero would mean the sweep measured nothing; these families are import-heavy by construction.
  expect(checked).toBeGreaterThan(20);
}, 120_000);

// ---------------------------------------------------------------------------------------------------
// RECEIPT REFUSALS. Each of these policies locates a HOME and refuses when it is gone — the final form of
// the legacy rename tripwires and the §4.6 blindness arm, which conformance cannot express because a
// refusal is a TOOL ERROR rather than a finding.
// ---------------------------------------------------------------------------------------------------
test("bound-field-via-hook REFUSES when the form-context home no longer exports the hook", () => {
  const renamed = passOf(boundFieldViaHook, {
    "packages/client/src/forms/contexts.ts": "export const fieldContext = null;\n",
    "packages/client/src/forms/bound-fields/x-field.tsx": "export const f = null;\n",
  });

  expect(renamed.toolErrors).toMatchObject([{ policyId: "bound-field-via-hook", phase: "receipt" }]);
  expect(renamed.authority.withheldPolicyIds).toEqual(["bound-field-via-hook"]);
  expect(renamed.authority.effectiveFindings).toEqual([]);
});

test("chat-stream-writes-in-bus-only REFUSES when the write api's home is gone", () => {
  const gone = passOf(chatStreamWritesInBusOnly, {
    "packages/client/src/features/chat/x.ts": "const chatStream = {\n  push(): void {},\n};\nexport const s = chatStream.push;\n",
  });

  expect(gone.toolErrors).toMatchObject([{ policyId: "chat-stream-writes-in-bus-only", phase: "receipt" }]);
  expect(gone.authority.withheldPolicyIds).toEqual(["chat-stream-writes-in-bus-only"]);
});

test("selection-store-via-factory REFUSES when the raw store door is gone", () => {
  const gone = passOf(selectionStoreViaFactory, {
    "packages/client/src/state/x-selection-store.ts": 'export const useX = createGatedStore("x", () => ({}));\n',
  });

  expect(gone.toolErrors).toMatchObject([{ policyId: "selection-store-via-factory", phase: "receipt" }]);
  expect(gone.authority.effectiveFindings).toEqual([]);
});

test("render-error-via-battery REFUSES when either the boundary or the battery home is gone", () => {
  const gone = passOf(renderErrorViaBattery, {
    "packages/client/src/data/query-boundary.tsx": "export declare function QueryBoundary(props: { renderError?: unknown }): unknown;\n",
    "packages/client/src/features/a/x.tsx":
      'import { QueryBoundary } from "../../data/query-boundary.tsx";\nexport const G = () => <QueryBoundary renderError={() => null} />;\n',
  });

  expect(gone.toolErrors).toMatchObject([{ policyId: "render-error-via-battery", phase: "receipt" }]);
  expect(gone.authority.withheldPolicyIds).toEqual(["render-error-via-battery"]);
});

test("registry-context-via-mint REFUSES when the registry vocabulary's home is gone", () => {
  const gone = passOf(registryContextViaMint, {
    "packages/client/src/state/g.ts": "export const C = null;\n",
  });

  expect(gone.toolErrors).toMatchObject([{ policyId: "registry-context-via-mint", phase: "receipt" }]);
});

test("no-raw-zustand-persist REFUSES when NO file declares the durable-local registry (the §4.6 blindness arm)", () => {
  const blind = passOf(noRawZustandPersist, {
    "packages/client/src/state/create-persisted-store.ts": "export const useStore = null;\n",
  });

  expect(blind.toolErrors).toMatchObject([{ policyId: "no-raw-zustand-persist", phase: "receipt" }]);
  expect(blind.authority.withheldPolicyIds).toEqual(["no-raw-zustand-persist"]);
});

test("no-effect-on-shared-selection REFUSES when a pointer in its vocabulary no longer exists", () => {
  const renamed = passOf(noEffectOnSharedSelection, {
    "packages/client/src/state/index.ts": "export declare function useActiveChatId(): string | null;\n",
    "packages/client/src/features/chat/x.ts": "export const c = null;\n",
  });

  // Six of the seven pointers are missing from this barrel: the receipt carries them as UNRESOLVED, which
  // refuses exactly as a zero would. The legacy regex simply stopped matching them.
  expect(renamed.toolErrors).toMatchObject([{ policyId: "no-effect-on-shared-selection", phase: "receipt" }]);
  expect(renamed.policies[0]?.receipts).toMatchObject([{ kind: "population", source: "shared-selection pointers", members: 1, unresolved: 6 }]);
});

// ---------------------------------------------------------------------------------------------------
// GRANT LIVENESS. These policies' authority IS the central table, so the two verdicts that make a row
// honest are pinned here on a real policy rather than assumed.
// ---------------------------------------------------------------------------------------------------
const BUS_GRANT = {
  id: "chat-stream-writes-in-bus-only:proof",
  policyId: "chat-stream-writes-in-bus-only",
  subject: "packages/client/src/data/bus/chat-bus-writes.ts",
  operation: "chat-stream-write-handle",
  why: "the proof's stand-in for the real bus applier row",
  endsWhen: "the pin no longer exercises the applier",
};
const STREAM_HOME = { "packages/client/src/state/chat-stream.ts": "export const chatStream = {\n  push(): void {},\n};\n" };

test("a grant row licenses its exact subject/operation and is consumed EXACTLY ONCE, even with two occurrences", () => {
  const granted = passOf(
    chatStreamWritesInBusOnly,
    {
      ...STREAM_HOME,
      "packages/client/src/data/bus/chat-bus-writes.ts":
        'import { chatStream } from "../../state/chat-stream.ts";\nimport * as state from "../../state/chat-stream.ts";\nexport const a = (): void => chatStream.push();\nexport const b = (): void => state.chatStream.push();\n',
    },
    [BUS_GRANT],
  );

  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  // The dedupe is what makes this ONE: two occurrences of the same licensed act under one row would be
  // OVER-BROAD, and an over-broad row licenses NOTHING.
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: BUS_GRANT.id, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test("a grant row that matches nothing after a complete run is STALE", () => {
  const stale = passOf(
    chatStreamWritesInBusOnly,
    {
      ...STREAM_HOME,
      "packages/client/src/data/bus/chat-bus-writes.ts": "export const a = (): void => undefined;\n",
    },
    [BUS_GRANT],
  );

  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: BUS_GRANT.id }]);
});

test("a grant row keyed on the WRONG operation licenses nothing", () => {
  const mismatched = passOf(
    chatStreamWritesInBusOnly,
    {
      ...STREAM_HOME,
      "packages/client/src/data/bus/chat-bus-writes.ts":
        'import { chatStream } from "../../state/chat-stream.ts";\nexport const a = (): void => chatStream.push();\n',
    },
    [{ ...BUS_GRANT, operation: "chat-stream-read" }],
  );

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant" }]);
});
