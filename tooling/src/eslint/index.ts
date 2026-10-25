import type { CustomPropertyUses } from "../css-names/index.ts";
import { browserNoNodeGlobalsRule, rawEgressRule, rawHttpClientRule, sessionChannelBoundaryRule, soleEnvReaderRule } from "./ambient.ts";
import { detachedWorkRule } from "./async.ts";
import { browserSupportRule } from "./browser-support.ts";
import { CLIENT_DATA_RESTRICTIONS, effectOnSharedSelectionRule } from "./client-data-policy.ts";
import { assumesSingleReplicaRule, commentedCodeRule, rawIdRule, sideGenSamplingRule, wireJsonRule } from "./general.ts";
import { DB_SCHEMA_RESTRICTIONS, SERVER_HARD_RESTRICTIONS, TYPE_SHAPE_RESTRICTIONS } from "./general-policy.ts";
import { moduleStateRule } from "./module-state.ts";
import type { BaseUiDoors } from "./motion.ts";
import { baseUiStateDataAttributesRule, noRenderLayoutReadRule, unruledFlipInversionRule } from "./motion.ts";
import { baseUiPortalContainerRule, contextReturnTypeRule, directRowReadRule, directRowWriteRule, nativeTitleRule, testFactoryContractRule } from "./native.ts";
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
import { ctNegativeOnlyCaseRule } from "./test-absence.ts";
import type { ExportedLabel } from "./test-labels.ts";
import { handCopiedLabelRule } from "./test-labels.ts";
import {
  CT_SPEC_RESTRICTIONS,
  CT_STORY_ROOT_RESTRICTIONS,
  shellDomSelectors,
  TEST_APPEARANCE_RESTRICTIONS,
  TEST_FABRICATION_RESTRICTIONS,
} from "./test-policy.ts";
import { ctResponderReadsInputRule } from "./test-routes.ts";
import { ctPollIntervalsSharedRule, evaluateNoScopeCaptureRule, typedTestIdRule, uiCtColorRule } from "./tests.ts";
import { textVoiceOnlyRule } from "./text-voices.ts";
import type { AppearanceVocabulary } from "./ui-appearance.ts";
import { appearanceNameRule } from "./ui-appearance.ts";
import { floorlessControlRule, registerApiRule, registryContextRule, stateFilesRule, storeDerivedRule } from "./ui-composition.ts";
import { customPropertyDeclaredRule } from "./ui-custom-properties.ts";
import type { DomLookupHome } from "./ui-dom.ts";
import { classListWriteRule, domLookupRule } from "./ui-dom.ts";
import type { CandidatesToCss, ClassClassifier } from "./ui-feature-classname.ts";
import { featureClassNameLayoutOnlyRule, noBuiltClassStringRule } from "./ui-feature-classname.ts";
import { UI_FEATURE_RESTRICTIONS } from "./ui-feature-policy.ts";
import { rawIntrinsicPaintRule } from "./ui-intrinsics.ts";
import { noManualMemoRule, noUsePromiseRule } from "./ui-law-policy.ts";
import {
  CLASS_RESTRICTIONS,
  CLIENT_CONFIG_HOST_RESTRICTIONS,
  CLIENT_CONTEXT_RESTRICTIONS,
  CLIENT_DOM_RESTRICTIONS,
  CLIENT_SEAL_RESTRICTIONS,
  CLIENT_STYLE_RESTRICTIONS,
  ID_BRAND_RESTRICTIONS,
  PORTAL_FLOAT_RESTRICTIONS,
  UI_HARD_RESTRICTIONS,
  UI_PRIMITIVE_RESTRICTIONS,
} from "./ui-policy.ts";
import { noSealedInternalsRule } from "./ui-sealed-internals.ts";
import { darkVariantRule, noStaticStylePropRule, offTokenInlineStyleRule, recededInkRule, themeOverrideRule } from "./ui-styles.ts";

export { authorClassIgnores } from "./css-classes.ts";
export { baseUiDoors } from "./motion.ts";
export { shellOwnedSlots } from "./shell-slots.ts";
export { exportedLabels } from "./test-labels.ts";
export { domLookupRule } from "./ui-dom.ts";
export { classClassifier } from "./ui-feature-classname.ts";

const LOCAL_RESTRICTIONS = [
  TEST_FABRICATION_RESTRICTIONS,
  UI_FEATURE_RESTRICTIONS,
  CLIENT_DATA_RESTRICTIONS,
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
  CLIENT_DOM_RESTRICTIONS,
  CLIENT_CONFIG_HOST_RESTRICTIONS,
  CLIENT_SEAL_RESTRICTIONS,
  PORTAL_FLOAT_RESTRICTIONS,
  CT_SPEC_RESTRICTIONS,
  TEST_APPEARANCE_RESTRICTIONS,
  CT_STORY_ROOT_RESTRICTIONS,
  SERVER_HARD_RESTRICTIONS,
  DB_SCHEMA_RESTRICTIONS,
  UI_PRIMITIVE_RESTRICTIONS,
  UI_HARD_RESTRICTIONS,
  ID_BRAND_RESTRICTIONS,
  TYPE_SHAPE_RESTRICTIONS,
].flat();

/** Keep UI and Biome policy inputs in the root config without importing their runtime graphs. */
export function createOrbPlugin(options: {
  browserNodeGlobals: ReadonlySet<string>;
  floorlessButtonSizes: ReadonlySet<string>;
  shellClasses: ReadonlySet<string>;
  shellSlots: ReadonlySet<string>;
  exportedLabels: ReadonlyMap<string, ExportedLabel>;
  appearanceVocabulary: AppearanceVocabulary;
  /** Compat keys some browser floor lacks (`unsupportedAtFloor`). */
  browserUnsupported: ReadonlyMap<string, readonly string[]>;
  /** The same table without the polyfill allowance, for the files that run before the polyfills are installed. */
  browserUnsupportedBeforePolyfills: ReadonlyMap<string, readonly string[]>;
  /** Properties a browser may ignore with no layout or behavior change (`HARMLESS_WHEN_UNSUPPORTED`). */
  browserHarmless: Readonly<Record<string, string>>;
  /** Tailwind's `DesignSystem.candidatesToCss`. */
  candidatesToCss: CandidatesToCss;
  customProperties: CustomPropertyUses;
  classifyClass: ClassClassifier;
  baseUiDoors: BaseUiDoors;
  domLookupHomes: readonly DomLookupHome[];
}): {
  rules: Record<string, OrbRule>;
} {
  return {
    rules: {
      ...Object.fromEntries(LOCAL_RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)] as const)),
      "no-raw-intrinsic-paint": rawIntrinsicPaintRule(options.shellClasses),
      "no-hand-built-shell-dom": restrictionRule({ selectors: shellDomSelectors(options.shellSlots) }),
      "appearance-name-in-manifest": appearanceNameRule(options.appearanceVocabulary),
      "custom-property-declared": customPropertyDeclaredRule(options.customProperties),
      "feature-classname-layout-only": featureClassNameLayoutOnlyRule(options.classifyClass),
      "no-built-class-string": noBuiltClassStringRule,
      "text-voice-only": textVoiceOnlyRule,
      ...Object.fromEntries(PRINCIPAL_RULES.map(({ id, rule }) => [id, rule] as const)),
      "ui-ct-no-color-literal": uiCtColorRule,
      "no-raw-egress": rawEgressRule,
      "no-raw-http-client": rawHttpClientRule,
      "sole-env-reader": soleEnvReaderRule,
      "baseui-portal-container-seam": baseUiPortalContainerRule,
      "baseui-state-data-attributes": baseUiStateDataAttributesRule(options.baseUiDoors),
      "no-unruled-flip-inversion": unruledFlipInversionRule,
      "no-dom-lookup-in-features": domLookupRule(options.domLookupHomes),
      "no-class-list-write": classListWriteRule,
      "no-render-layout-read": noRenderLayoutReadRule,
      "no-sealed-library-internals": noSealedInternalsRule,
      "no-static-style-prop": noStaticStylePropRule,
      "no-native-title": nativeTitleRule,
      "no-manual-memo": noManualMemoRule,
      "no-use-promise": noUsePromiseRule,
      "test-factory-contract": testFactoryContractRule,
      "no-direct-row-writes": directRowWriteRule,
      "no-direct-row-reads": directRowReadRule,
      "no-context-returntype": contextReturnTypeRule,
      "no-raw-id": rawIdRule,
      "wire-json-parsed-at-consumer": wireJsonRule,
      "no-off-token-inline-style": offTokenInlineStyleRule,
      "theme-override-only-via-scope": themeOverrideRule,
      "no-tailwind-dark-variant": darkVariantRule,
      "zustand-selector-derived": storeDerivedRule,
      "no-mutating-register-api": registerApiRule,
      "state-files": stateFilesRule,
      "no-effect-on-shared-selection": effectOnSharedSelectionRule,
      "registry-context-via-mint": registryContextRule,
      "testid-typed-only": typedTestIdRule('Freeform data-testid string; use the typed registry via testId("key").'),
      "testid-typed-only-stories": typedTestIdRule(
        'Freeform data-testid string in a CT story; use storyTestId("key") for a story-only id or testId("key") for a production id.',
      ),
      "ct-poll-intervals-shared": ctPollIntervalsSharedRule,
      "ct-responder-reads-input": ctResponderReadsInputRule,
      "ct-negative-only-case": ctNegativeOnlyCaseRule,
      "no-hand-copied-label": handCopiedLabelRule(options.exportedLabels),
      "no-floorless-control-in-wrap": floorlessControlRule(options.floorlessButtonSizes),
      "evaluate-no-scope-capture": evaluateNoScopeCaptureRule,
      "assumes-single-replica": assumesSingleReplicaRule,
      "no-module-state": moduleStateRule,
      "no-hardcoded-side-gen-sampling": sideGenSamplingRule,
      "session-channel-boundary": sessionChannelBoundaryRule,
      "receded-ink-integrity": recededInkRule,
      "detached-work-traced": detachedWorkRule,
      "commented-code": commentedCodeRule,
      "plugin-dump-guard": restrictionRule({ selectors: PLUGIN_DUMP_SELECTORS }),
      "browser-no-node-globals": browserNoNodeGlobalsRule(options.browserNodeGlobals),
      "browser-support": browserSupportRule({
        unsupported: options.browserUnsupported,
        harmless: options.browserHarmless,
        candidatesToCss: options.candidatesToCss,
      }),
      "browser-support-entry": browserSupportRule({
        unsupported: options.browserUnsupportedBeforePolyfills,
        harmless: options.browserHarmless,
        candidatesToCss: options.candidatesToCss,
      }),
    },
  };
}
