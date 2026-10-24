import { browserNoNodeGlobalsRule, rawEgressRule, rawHttpClientRule, sessionChannelBoundaryRule, soleEnvReaderRule } from "./ambient.ts";
import { detachedWorkRule } from "./async.ts";
import { assumesSingleReplicaRule, commentedCodeRule, rawIdRule, sideGenSamplingRule, wireJsonRule } from "./general.ts";
import { DB_SCHEMA_RESTRICTIONS, SERVER_HARD_RESTRICTIONS, TYPE_SHAPE_RESTRICTIONS } from "./general-policy.ts";
import { baseUiPortalContainerRule, contextReturnTypeRule, directRowWriteRule, testFactoryContractRule } from "./native.ts";
import { PRINCIPAL_RULES } from "./principal.ts";
import {
  AMBIENT_GLOBAL_RESTRICTIONS,
  IDENTITY_WRITER_RESTRICTIONS,
  INFRA_AUTH_RESTRICTIONS,
  PLUGIN_DUMP_SELECTORS,
  ROLE_DATA_RESTRICTIONS,
  SANDBOX_WIRE_ID_RESTRICTIONS,
  SERVER_EVENT_RESTRICTIONS,
  SERVER_SCOPE_RESTRICTIONS,
  TABLE_IMPORT_RESTRICTIONS,
  TURN_IDENTITY_RESTRICTIONS,
} from "./security-policy.ts";
import type { OrbRule } from "./syntax.ts";
import { restrictionRule } from "./syntax.ts";
import { CT_SPEC_RESTRICTIONS, TEST_FABRICATION_RESTRICTIONS } from "./test-policy.ts";
import { ctPollIntervalsSharedRule, evaluateNoScopeCaptureRule, typedTestIdRule, uiCtColorRule } from "./tests.ts";
import { floorlessControlRule, registerApiRule, registryContextRule, stateFilesRule, storeDerivedRule } from "./ui-composition.ts";
import { UI_FEATURE_RESTRICTIONS } from "./ui-feature-policy.ts";
import {
  CLASS_RESTRICTIONS,
  CLASS_TOKEN_RESTRICTIONS,
  CLIENT_CONFIG_HOST_RESTRICTIONS,
  CLIENT_CONTEXT_RESTRICTIONS,
  CLIENT_SEAL_RESTRICTIONS,
  CLIENT_STYLE_RESTRICTIONS,
  ID_BRAND_RESTRICTIONS,
  PORTAL_FLOAT_RESTRICTIONS,
  UI_HARD_RESTRICTIONS,
  UI_PRIMITIVE_RESTRICTIONS,
} from "./ui-policy.ts";
import { darkVariantRule, offTokenInlineStyleRule, recededInkRule, themeOverrideRule } from "./ui-styles.ts";

export { authorClassIgnores } from "./css-classes.ts";

const LOCAL_RESTRICTIONS = [
  TEST_FABRICATION_RESTRICTIONS,
  UI_FEATURE_RESTRICTIONS,
  SERVER_EVENT_RESTRICTIONS,
  INFRA_AUTH_RESTRICTIONS,
  TABLE_IMPORT_RESTRICTIONS,
  IDENTITY_WRITER_RESTRICTIONS,
  CLASS_RESTRICTIONS,
  ROLE_DATA_RESTRICTIONS,
  SANDBOX_WIRE_ID_RESTRICTIONS,
  TURN_IDENTITY_RESTRICTIONS,
  SERVER_SCOPE_RESTRICTIONS,
  AMBIENT_GLOBAL_RESTRICTIONS,
  CLIENT_CONTEXT_RESTRICTIONS,
  CLIENT_STYLE_RESTRICTIONS,
  CLIENT_CONFIG_HOST_RESTRICTIONS,
  CLIENT_SEAL_RESTRICTIONS,
  CLASS_TOKEN_RESTRICTIONS,
  PORTAL_FLOAT_RESTRICTIONS,
  CT_SPEC_RESTRICTIONS,
  SERVER_HARD_RESTRICTIONS,
  DB_SCHEMA_RESTRICTIONS,
  UI_PRIMITIVE_RESTRICTIONS,
  UI_HARD_RESTRICTIONS,
  ID_BRAND_RESTRICTIONS,
  TYPE_SHAPE_RESTRICTIONS,
].flat();

/** Keep UI and Biome policy inputs in the root config without importing their runtime graphs. */
export function createOrbPlugin(options: { browserNodeGlobals: ReadonlySet<string>; floorlessButtonSizes: ReadonlySet<string> }): {
  rules: Record<string, OrbRule>;
} {
  return {
    rules: {
      ...Object.fromEntries(LOCAL_RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)] as const)),
      ...Object.fromEntries(PRINCIPAL_RULES.map(({ id, rule }) => [id, rule] as const)),
      "ui-ct-no-color-literal": uiCtColorRule,
      "no-raw-egress": rawEgressRule,
      "no-raw-http-client": rawHttpClientRule,
      "sole-env-reader": soleEnvReaderRule,
      "baseui-portal-container-seam": baseUiPortalContainerRule,
      "test-factory-contract": testFactoryContractRule,
      "no-direct-row-writes": directRowWriteRule,
      "no-context-returntype": contextReturnTypeRule,
      "no-raw-id": rawIdRule,
      "wire-json-parsed-at-consumer": wireJsonRule,
      "no-off-token-inline-style": offTokenInlineStyleRule,
      "theme-override-only-via-scope": themeOverrideRule,
      "no-tailwind-dark-variant": darkVariantRule,
      "zustand-selector-derived": storeDerivedRule,
      "no-mutating-register-api": registerApiRule,
      "state-files": stateFilesRule,
      "registry-context-via-mint": registryContextRule,
      "testid-typed-only": typedTestIdRule('Freeform data-testid string; use the typed registry via testId("key").'),
      "testid-typed-only-stories": typedTestIdRule(
        'Freeform data-testid string in a CT story; use storyTestId("key") for a story-only id or testId("key") for a production id.',
      ),
      "ct-poll-intervals-shared": ctPollIntervalsSharedRule,
      "no-floorless-control-in-wrap": floorlessControlRule(options.floorlessButtonSizes),
      "evaluate-no-scope-capture": evaluateNoScopeCaptureRule,
      "assumes-single-replica": assumesSingleReplicaRule,
      "no-hardcoded-side-gen-sampling": sideGenSamplingRule,
      "session-channel-boundary": sessionChannelBoundaryRule,
      "receded-ink-integrity": recededInkRule,
      "detached-work-traced": detachedWorkRule,
      "commented-code": commentedCodeRule,
      "plugin-dump-guard": restrictionRule({ selectors: PLUGIN_DUMP_SELECTORS }),
      "browser-no-node-globals": browserNoNodeGlobalsRule(options.browserNodeGlobals),
    },
  };
}
