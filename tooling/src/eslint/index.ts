import { browserNoNodeGlobalsRule, rawEgressRule, rawHttpClientRule, sessionChannelBoundaryRule, soleEnvReaderRule } from "./ambient.ts";
import { blindCatchRule, detachedWorkRule } from "./async.ts";
import { browserSupportRule } from "./browser-support.ts";
import { CLIENT_DATA_RESTRICTIONS, effectOnSharedSelectionRule } from "./client-data-policy.ts";
import { closedVocabularyRule } from "./closed-vocabulary.ts";
import { confirmedActionMintRule } from "./confirmed-action-mint.ts";
import type { CustomPropertyUses } from "./css/custom-properties.ts";
import { derivedPortMemberRule } from "./derived-port.ts";
import { destructiveNeedsConfirmRule } from "./destructive-confirm.ts";
import { enforcementClaimRule } from "./enforcement-claim.ts";
import { assumesSingleReplicaRule, commentedCodeRule, sideGenSamplingRule, wireJsonRule } from "./general.ts";
import { DB_SCHEMA_RESTRICTIONS, SERVER_HARD_RESTRICTIONS, TYPE_SHAPE_RESTRICTIONS } from "./general-policy.ts";
import { moduleStateRule } from "./module-state.ts";
import type { BaseUiDoors } from "./motion.ts";
import { baseUiStateDataAttributesRule, noRenderLayoutReadRule, unruledFlipInversionRule } from "./motion.ts";
import { narrowedJsonBrandRule } from "./narrowed-json.ts";
import { baseUiPortalContainerRule, contextReturnTypeRule, directRowReadRule, directRowWriteRule, nativeTitleRule, testFactoryContractRule } from "./native.ts";
import { optionalAlternativesRule } from "./optional-alternatives.ts";
import { ownedTableRule } from "./owned-table.ts";
import { PRINCIPAL_RULES } from "./principal.ts";
import { queryStateLadderRule } from "./query-state-ladder.ts";
import { rawIdRule } from "./raw-id.ts";
import {
  AMBIENT_GLOBAL_RESTRICTIONS,
  IDENTITY_WRITER_RESTRICTIONS,
  INFRA_AUTH_RESTRICTIONS,
  OWNED_TABLE_RESTRICTIONS,
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
import type { CssVocabulary } from "./test-derivation.ts";
import {
  noBareThrowAssertionRule,
  noFilteredCaseTableRule,
  noHandTypedCssTokenRule,
  noSpreadCorpusCaptureRule,
  noUnseededTypeIdRule,
} from "./test-derivation.ts";
import type { ExportedLabel } from "./test-labels.ts";
import { handCopiedLabelRule } from "./test-labels.ts";
import { ownedRootAliasRule } from "./test-owners.ts";
import {
  CT_SPEC_RESTRICTIONS,
  CT_STORY_ROOT_RESTRICTIONS,
  shellDomSelectors,
  TEST_APPEARANCE_RESTRICTIONS,
  TEST_FABRICATION_RESTRICTIONS,
} from "./test-policy.ts";
import { noTailRecorderReadRule } from "./test-recorders.ts";
import type { ProductionRoster } from "./test-rosters.ts";
import { restatedRosterRule } from "./test-rosters.ts";
import { ctResponderReadsInputRule } from "./test-routes.ts";
import { ctPollIntervalsSharedRule, evaluateNoScopeCaptureRule, typedTestIdRule, uiCtColorRule } from "./tests.ts";
import { textVoiceOnlyRule } from "./text-voices.ts";
import { preferToSortedRule } from "./to-sorted.ts";
import { trpcOutputKeysRule } from "./trpc-output.ts";
import { trpcPayloadKeysRule } from "./trpc-payload.ts";
import type { AppearanceVocabulary } from "./ui-appearance.ts";
import { appearanceNameRule } from "./ui-appearance.ts";
import { floorlessControlRule, registerApiRule, registryContextRule, stateFilesRule, storeDerivedRule } from "./ui-composition.ts";
import { anchorProvidesContainerRule, surfaceConsumesContainerRule } from "./ui-containment.ts";
import { customPropertyDeclaredRule } from "./ui-custom-properties.ts";
import type { DomLookupHome } from "./ui-dom.ts";
import { classListWriteRule, domLookupRule } from "./ui-dom.ts";
import type { CandidatesToCss, ClassClassifier, PropOwners } from "./ui-feature-classname.ts";
import { featureClassNameLayoutOnlyRule, noBuiltClassStringRule } from "./ui-feature-classname.ts";
import { CONFIRMED_ACTION_MINT_HOMES, UI_FEATURE_RESTRICTIONS } from "./ui-feature-policy.ts";
import { intentColorRecipeRule } from "./ui-intent-color.ts";
import { rawIntrinsicPaintRule } from "./ui-intrinsics.ts";
import { noManualMemoRule, noUsePromiseRule } from "./ui-law-policy.ts";
import {
  nativeCallbackNarrowingRule,
  opaqueClassSpreadRule,
  opaqueVariantSpreadRule,
  overwrittenRefRule,
  unresolvedStyleSpreadRule,
} from "./ui-native-contracts.ts";
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
import { darkVariantRule, noStaticStylePropRule, offTokenInlineStyleRule, themeOverrideRule } from "./ui-styles.ts";
import { BRAND_MINT_HOMES, noUnsafeCastRule, UNSAFE_CAST_HOMES } from "./unsafe-cast.ts";

export { BrandTable, type NameMatch } from "./brand-names.ts";
export type { CustomPropertyUses } from "./css/custom-properties.ts";
export {
  baseUiCustomProperties,
  customPropertyUses,
  declaredCustomProperties,
  declaredInCss,
  PROPERTY_READ,
  RUNTIME_CUSTOM_PROPERTIES,
  VENDOR_CUSTOM_PROPERTIES,
} from "./css/custom-properties.ts";
export { intentColorRecipe } from "./css/intent-color-recipe.ts";
export { authorClassIgnores } from "./css-classes.ts";
export { baseUiDoors } from "./motion.ts";
export { literalKeys } from "./optional-alternatives.ts";
export {
  aliased,
  describeForeignTypes,
  type ForeignTypes,
  foreignTypes,
  isSplitSignature,
  mergeForeignTypes,
  passesDbHandle,
  runtimeTypes,
} from "./port-ownership/foreign-types.ts";
export {
  aliasChain,
  aliasOf,
  derivedMembers,
  effectiveMember,
  type Flow,
  flowMembers,
  flowsAt,
  homeFileOf,
  isContractFile,
  isHandTyped,
  memberLabel,
  type PortMember,
  placementOf,
  RELATION,
  type Restatement,
  restatementOf,
  restatementsAt,
  rootAlias,
  rulingKeysOf,
  type TypeFlow,
  tierRank,
} from "./port-ownership/restated-port.ts";
export { JOINT_BATCH_RULINGS, jointBatchRulingOf } from "./port-ownership/ruled-ops.ts";
export { lazy, productionModules } from "./production-modules.ts";
export { shellOwnedSlots } from "./shell-slots.ts";
export { homeReasons, homes, memberNamed, posixPath } from "./syntax.ts";
export { exportedLabels, exportedProductionValues } from "./test-labels.ts";
export { OWNED_ROOT_ACQUISITIONS } from "./test-owners.ts";
export { exportedRosters } from "./test-rosters.ts";
export { conflicts, survives } from "./ui-classes/class-conflict.ts";
export type { ClassExpression } from "./ui-classes/class-expression.ts";
export { classesIn, classesWhen, guardsIn, opaqueIn } from "./ui-classes/class-expression.ts";
export type { ClassConstants, TokenFact } from "./ui-classes/classes.ts";
export { ALPHA_UTILITY, attributeClasses, baseOf, classifyToken, classStringsOf, referencedClassConstants } from "./ui-classes/classes.ts";
export type { FileFacts } from "./ui-classes/file-facts.ts";
export { buttonWithText, dialogVerbOf, factsOf, firstLine, hasAny, insideTag } from "./ui-classes/file-facts.ts";
export type { Wearer } from "./ui-classes/hand-arms.ts";
export { attributeValue, coveredJudgement, elementRefOf, kebab, ownerRow, wearerOf, writingAxis } from "./ui-classes/hand-arms.ts";
export type { Category, ElementRef, Hit, Judgement, KeepCode, Place, Verdict } from "./ui-classes/hand-model.ts";
export {
  byPlace,
  CATEGORIES,
  CONTAINER_PROPERTY,
  GRADIENT_OWNER,
  HAND_ROLLING_PART,
  hitOf,
  IMPORTANT_OWNER,
  judgeLit,
  KEEP_REASONS,
  KEYFRAME_PROPERTY,
  keepJudgement,
  QUERY_PROPERTY,
  SUPPORTS_PROPERTY,
  VERDICTS,
} from "./ui-classes/hand-model.ts";
export type { Rendered } from "./ui-classes/list-slots.ts";
export { listSlotSurfacePaths, listSlotSurfaces, mounted, SLOT_HOPS } from "./ui-classes/list-slots.ts";
export type { Lit } from "./ui-classes/literals.ts";
export { conditionLits, conditionStringLits, lit, litsOf, parseValue, valueStringLits, written } from "./ui-classes/literals.ts";
export { PLAIN_LAYOUT, PLAIN_LAYOUT_RULE, plainLayout } from "./ui-classes/plain-layout.ts";
export type { Elem, Layer, Source } from "./ui-classes/source.ts";
export { attrString, childrenText, constInitializer, doorOf, elementsOf, lineOf, loadSources, unwrap, visit } from "./ui-classes/source.ts";
export type { LengthTokens, TokenNamespace, ValueTokens } from "./ui-classes/tokens.ts";
export { lengthTokensOf, loadValueTokens, pxOf, tokensFor, tokensHolding } from "./ui-classes/tokens.ts";
export type { ComponentRecipe, ComponentTables, Compound } from "./ui-classes/variant-tables.ts";
export { componentsIn, componentTables, firstFunction, propsPattern } from "./ui-classes/variant-tables.ts";
export type { Arm, ArmClasses, AxisUse, DeclaredVariants, VariantReport } from "./ui-classes/variants.ts";
export { declaredVariants, totalUses, variantReport } from "./ui-classes/variants.ts";
export { domLookupRule } from "./ui-dom.ts";
export type { PropOwner, PropOwners } from "./ui-feature-classname.ts";
export { classClassifier } from "./ui-feature-classname.ts";
export { DESTRUCTIVE_EXEMPT } from "./ui-feature-policy.ts";

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
  floorlessControls: ReadonlySet<string>;
  shellClasses: ReadonlySet<string>;
  shellSlots: ReadonlySet<string>;
  /** Read on the rule's first file, as are the two indexes below: a config resolved for another file builds none. */
  exportedLabels: () => ReadonlyMap<string, ExportedLabel>;
  /** The strings `exportedLabels` leaves out; `no-hand-copied-label` reads them under scope `all`. */
  exportedProductionValues: () => ReadonlyMap<string, ExportedLabel>;
  /** Every exported production string tuple; `no-restated-roster` reads it. */
  exportedRosters: () => readonly ProductionRoster[];
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
  /** The prop of an `@orb/ui` component that writes a class, read from its tables (`classOwners`). */
  propOwners: PropOwners;
  baseUiDoors: BaseUiDoors;
  domLookupHomes: readonly DomLookupHome[];
  /** The D336 tones that carry a base `--color-*` token, whose hand-written colour recipes are refused. */
  intentColors: readonly string[];
  /** The `TOKENS` and `MEDIA_QUERIES` spellings a test reads instead of typing. */
  cssVocabulary: CssVocabulary;
}): {
  rules: Record<string, OrbRule>;
} {
  return {
    rules: {
      ...Object.fromEntries(LOCAL_RESTRICTIONS.map((entry) => [entry.id, restrictionRule(entry)] as const)),
      ...Object.fromEntries(OWNED_TABLE_RESTRICTIONS.map((row) => [row.id, ownedTableRule(row)] as const)),
      "destructive-needs-confirm": destructiveNeedsConfirmRule,
      "confirmed-action-mint": confirmedActionMintRule(CONFIRMED_ACTION_MINT_HOMES),
      "surface-consumes-container": surfaceConsumesContainerRule,
      "anchor-provides-container": anchorProvidesContainerRule,
      "no-raw-intrinsic-paint": rawIntrinsicPaintRule(options.shellClasses),
      "no-hand-built-shell-dom": restrictionRule({ selectors: shellDomSelectors(options.shellSlots) }),
      "appearance-name-in-manifest": appearanceNameRule(options.appearanceVocabulary),
      "custom-property-declared": customPropertyDeclaredRule(options.customProperties),
      "feature-classname-layout-only": featureClassNameLayoutOnlyRule(options.classifyClass, options.propOwners),
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
      "no-overwritten-ref": overwrittenRefRule,
      "no-unresolved-style-spread": unresolvedStyleSpreadRule,
      "no-opaque-variant-spread": opaqueVariantSpreadRule,
      "no-opaque-class-spread": opaqueClassSpreadRule,
      "no-native-callback-narrowing": nativeCallbackNarrowingRule,
      "no-manual-memo": noManualMemoRule,
      "no-use-promise": noUsePromiseRule,
      "test-factory-contract": testFactoryContractRule,
      "no-direct-row-writes": directRowWriteRule,
      "no-direct-row-reads": directRowReadRule,
      "no-context-returntype": contextReturnTypeRule,
      "prefer-to-sorted": preferToSortedRule,
      "no-raw-id": rawIdRule,
      "closed-vocabulary": closedVocabularyRule,
      "no-query-state-ladder": queryStateLadderRule,
      "no-optional-alternatives": optionalAlternativesRule,
      "wire-json-parsed-at-consumer": wireJsonRule,
      "no-off-token-inline-style": offTokenInlineStyleRule,
      "theme-override-only-via-scope": themeOverrideRule,
      "no-tailwind-dark-variant": darkVariantRule,
      "no-intent-color-recipe": intentColorRecipeRule(options.intentColors),
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
      "no-hand-typed-css-token": noHandTypedCssTokenRule(options.cssVocabulary),
      "no-bare-throw-assertion": noBareThrowAssertionRule,
      "no-unseeded-type-id": noUnseededTypeIdRule,
      "no-filtered-case-table": noFilteredCaseTableRule,
      "no-spread-corpus-capture": noSpreadCorpusCaptureRule,
      "no-tail-recorder-read": noTailRecorderReadRule,
      "owned-root-alias": ownedRootAliasRule,
      "no-hand-copied-label": handCopiedLabelRule(options.exportedLabels, options.exportedProductionValues),
      "no-restated-roster": restatedRosterRule(options.exportedRosters),
      "no-floorless-control-in-wrap": floorlessControlRule(options.floorlessControls),
      "evaluate-no-scope-capture": evaluateNoScopeCaptureRule,
      "assumes-single-replica": assumesSingleReplicaRule,
      "no-module-state": moduleStateRule,
      "derived-port-member": derivedPortMemberRule,
      "trpc-payload-declared-keys": trpcPayloadKeysRule,
      "trpc-output-declared-keys": trpcOutputKeysRule,
      "no-unsafe-cast": noUnsafeCastRule(UNSAFE_CAST_HOMES, BRAND_MINT_HOMES),
      "narrowed-json-brand": narrowedJsonBrandRule,
      "no-hardcoded-side-gen-sampling": sideGenSamplingRule,
      "session-channel-boundary": sessionChannelBoundaryRule,
      "detached-work-traced": detachedWorkRule,
      "no-blind-catch": blindCatchRule,
      "commented-code": commentedCodeRule,
      "enforcement-claim-cites-checker": enforcementClaimRule,
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
