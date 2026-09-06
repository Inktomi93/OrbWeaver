import { Project } from "ts-morph";
import { gate as chromeRegistryCompleteness } from "../../../../tooling/src/verify/gates/chrome-registry-completeness.ts";
import { gate as modalBodyNotPlaceholder } from "../../../../tooling/src/verify/gates/modal-body-not-placeholder.ts";
import { gate as modalRegistryCompleteness } from "../../../../tooling/src/verify/gates/modal-registry-completeness.ts";
import { gate as placeholderCopyRegistry } from "../../../../tooling/src/verify/gates/placeholder-copy-registry.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/registry-family";

test("registry definition policies keep their founding and nearest-legal fixtures", () => {
  expect(verifyPolicyProofs([chromeRegistryCompleteness, modalBodyNotPlaceholder, modalRegistryCompleteness, placeholderCopyRegistry])).toEqual([]);
});

test("a zone vocabulary that stops resolving withholds the chrome verdict instead of passing", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/packages/client/src/state/section-registry.ts`, 'export const RAIL_ZONES = ["rail.nav"] as const;\n');
  project.createSourceFile(
    `${ROOT}/packages/client/src/state/chrome-registry.ts`,
    'import { RAIL_ZONES } from "./section-registry.ts";\nexport interface ChromeEntry { readonly id: string }\nexport const SHELL_ZONES = [...RAIL_ZONES] as const;\n',
  );
  project.createSourceFile(
    `${ROOT}/packages/client/src/features/x/lib/x-chrome.tsx`,
    'import type { ChromeEntry } from "../../../state/chrome-registry.ts";\nexport const xChrome: ChromeEntry = { id: "x", zone: "rail.nav", mobile: "sheet" };\n',
  );

  const result = runPolicyPass({
    knownPolicies: [chromeRegistryCompleteness],
    policies: [chromeRegistryCompleteness],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });

  // The §4.6 blindness rule, expressed as the runtime's own refusal: CHROME_ZONES was renamed, so the zone
  // arm has silently retired and the policy's second denominator is zero. It must not render a clean pass.
  expect(result.toolErrors).toMatchObject([{ policyId: "chrome-registry-completeness", phase: "receipt", message: expect.stringContaining("CHROME_ZONES") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["chrome-registry-completeness"]);
  expect(result.authority.effectiveFindings).toEqual([]);
});
