// Type-worlds phase 3 (#1861 / #1351): keep the Node-without-DOM forms model door at `#forms` and
// move the owning editor composition cluster behind `#forms/editor`. This is a clean pre-launch cut:
// moved symbols leave the pure barrel, source-mirror tests follow their owners, and path-named controls
// move in the same transaction. Dry-run is the default; `--apply` is reserved for the coordinated window.

import { join } from "node:path";
import process from "node:process";
import type { CodemodContext, SourceFile } from "@orb/tooling/codemod";
import { assert, DEFAULT_GLOBS, moveFiles, repointAliasPaths, routeSymbolsByMap, runCodemod } from "@orb/tooling/codemod";

const FORMS = "packages/client/src/forms";
const EDITOR = `${FORMS}/editor`;
const TEST_FORMS = "tests/client/forms";
const TEST_EDITOR = `${TEST_FORMS}/editor`;
const RESET_GATE_MODEL_PATH_ANCHORS = 3;

const BOUND_FIELD_FILES = [
  "avatar-upload-field.tsx",
  "color-field.tsx",
  "field-error.ts",
  "form-chrome.tsx",
  "macro-field.tsx",
  "multi-toggle-field.tsx",
  "number-field.tsx",
  "segment-field.tsx",
  "select-field.tsx",
  "slider-field.tsx",
  "switch-field.tsx",
  "text-field.tsx",
  "textarea-field.tsx",
  "use-bound-field.ts",
] as const;

const SOURCE_MOVES = [
  [`${FORMS}/autosave-status.tsx`, `${EDITOR}/autosave-status.tsx`],
  [`${FORMS}/capped-field.tsx`, `${EDITOR}/capped-field.tsx`],
  [`${FORMS}/contexts.ts`, `${EDITOR}/contexts.ts`],
  [`${FORMS}/create-autosave-entity-form.tsx`, `${EDITOR}/create-autosave-entity-form.tsx`],
  [`${FORMS}/create-saved-entity-form.ts`, `${EDITOR}/create-saved-entity-form.ts`],
  [`${FORMS}/section-save-status.tsx`, `${EDITOR}/section-save-status.tsx`],
  [`${FORMS}/use-app-form.ts`, `${EDITOR}/use-app-form.ts`],
  ...BOUND_FIELD_FILES.map((file) => [`${FORMS}/bound-fields/${file}`, `${EDITOR}/bound-fields/${file}`] as const),
] as const;

const TEST_MOVES = [
  [`${TEST_FORMS}/_ct-stories.tsx`, `${TEST_EDITOR}/_ct-stories.tsx`],
  [`${TEST_FORMS}/_form-identity-stories.tsx`, `${TEST_EDITOR}/_form-identity-stories.tsx`],
  [`${TEST_FORMS}/autosave-convergence.suite.test.ts`, `${TEST_EDITOR}/autosave-convergence.suite.test.ts`],
  [`${TEST_FORMS}/autosave-status.ct.tsx`, `${TEST_EDITOR}/autosave-status.ct.tsx`],
  [`${TEST_FORMS}/bound-fields/_ct-stories.tsx`, `${TEST_EDITOR}/bound-fields/_ct-stories.tsx`],
  [`${TEST_FORMS}/bound-fields/avatar-upload-field.ct.tsx`, `${TEST_EDITOR}/bound-fields/avatar-upload-field.ct.tsx`],
  [`${TEST_FORMS}/bound-fields/use-bound-field.ct.tsx`, `${TEST_EDITOR}/bound-fields/use-bound-field.ct.tsx`],
  [`${TEST_FORMS}/capped-field.ct.tsx`, `${TEST_EDITOR}/capped-field.ct.tsx`],
  [`${TEST_FORMS}/create-autosave-entity-form-model.test-d.ts`, `${TEST_EDITOR}/autosave-contract.test-d.ts`],
  [`${TEST_FORMS}/create-autosave-entity-form.ct.tsx`, `${TEST_EDITOR}/create-autosave-entity-form.ct.tsx`],
  [`${TEST_FORMS}/create-saved-entity-form.ct.tsx`, `${TEST_EDITOR}/create-saved-entity-form.ct.tsx`],
  [`${TEST_FORMS}/create-saved-entity-form.test.ts`, `${TEST_EDITOR}/create-saved-entity-form.test.ts`],
  [`${TEST_FORMS}/form-identity.suite.ct.tsx`, `${TEST_EDITOR}/form-identity.suite.ct.tsx`],
  [`${TEST_FORMS}/section-save-status.ct.tsx`, `${TEST_EDITOR}/section-save-status.ct.tsx`],
] as const;

const MOVED_PUBLIC_SYMBOLS = [
  "AppFormInstance",
  "AutosaveBoundaryProps",
  "AutosaveBoundaryPropsPersisting",
  "AutosaveBoundaryPropsReadOnly",
  "AutosaveBoundaryPropsSeamRequired",
  "AutosaveEntityBoundaryConfig",
  "AutosaveEntityBoundaryConfigWithoutSave",
  "AutosaveEntityBoundaryConfigWithSave",
  "AutosaveSession",
  "AutosaveStatus",
  "AutosaveStatusProps",
  "CappedFieldCounter",
  "CappedFieldCounterProps",
  "SavedEntityFormArgs",
  "SavedEntityFormConfig",
  "SectionSaveStatus",
  "SectionSaveStatusProps",
  "createAutosaveEntityForm",
  "createSavedEntityForm",
  "useAppForm",
  "useFieldContext",
  "useFormContext",
] as const;

const PURE_INDEX = `// forms/ — Node-without-DOM model/store seam; owning editor composition enters through #forms/editor.

export { CAPPED_FIELD_MAX_ROWS, showsCappedFieldCounter } from "./capped-field-model.ts";
export type { AutosaveSaveState } from "./create-autosave-entity-form-model.ts";
export type { FormHandleBridge } from "./create-form-handle-bridge.ts";
export { createFormHandleBridge } from "./create-form-handle-bridge.ts";
export { hashServerBaseline, mirrorDraft, readDraftSeed } from "./entity-form-base.ts";
export type { SaveCircuitBreaker, SaveCircuitBreakerConfig } from "./save-circuit-breaker.ts";
export { createSaveCircuitBreaker, DEFAULT_SAVE_BREAKER } from "./save-circuit-breaker.ts";
export {
  SaveStatusHostContext,
  SaveUnwritableContext,
  useReportSaveStatus,
  useSaveStatusHosted,
  useSaveUnwritable,
  useSaveUnwritableRef,
} from "./save-status-seam.ts";
`;

const EDITOR_INDEX = `// forms/editor — owning editor composition: shared hook, factories, bound controls, and rendered chrome.

export type { AutosaveStatusProps } from "../autosave-status.tsx";
export { AutosaveStatus } from "../autosave-status.tsx";
export type { CappedFieldCounterProps } from "../capped-field.tsx";
export { CappedFieldCounter } from "../capped-field.tsx";
export { useFieldContext, useFormContext } from "../contexts.ts";
export type {
  AutosaveBoundaryProps,
  AutosaveBoundaryPropsPersisting,
  AutosaveBoundaryPropsReadOnly,
  AutosaveBoundaryPropsSeamRequired,
  AutosaveEntityBoundaryConfig,
  AutosaveEntityBoundaryConfigWithoutSave,
  AutosaveEntityBoundaryConfigWithSave,
  AutosaveSession,
} from "./autosave-contract.ts";
export { createAutosaveEntityForm } from "../create-autosave-entity-form.tsx";
export type { SavedEntityFormArgs, SavedEntityFormConfig } from "../create-saved-entity-form.ts";
export { createSavedEntityForm } from "../create-saved-entity-form.ts";
export type { SectionSaveStatusProps } from "../section-save-status.tsx";
export { SectionSaveStatus } from "../section-save-status.tsx";
export type { AppFormInstance } from "../use-app-form.ts";
export { useAppForm } from "../use-app-form.ts";
`;

const CONTRACT_DECLARATIONS = [
  "AutosaveForm",
  "AutosaveSession",
  "AutosaveEntityBoundaryConfigBase",
  "AutosaveEntityBoundaryConfigWithSave",
  "AutosaveEntityBoundaryConfigWithoutSave",
  "AutosaveEntityBoundaryConfig",
  "AutosaveBoundaryPropsBase",
  "AutosaveBoundaryProps",
  "AutosaveBoundaryPropsPersisting",
  "AutosaveBoundaryPropsReadOnly",
  "AutosaveBoundaryPropsSeamRequired",
  "AutosaveBoundaryImplProps",
] as const;

type ContractDeclaration = NonNullable<ReturnType<SourceFile["getTypeAlias"]>> | NonNullable<ReturnType<SourceFile["getInterface"]>>;

function declarationByName(source: SourceFile, name: string): ContractDeclaration {
  const declaration = source.getTypeAlias(name) ?? source.getInterface(name);
  assert(declaration !== undefined, `Reviewed autosave contract declaration ${name} is missing.`);
  return declaration;
}

function removeNamedSpecifier(source: SourceFile, moduleSpecifier: string, name: string): void {
  const declaration = source.getImportDeclaration((candidate) => candidate.getModuleSpecifierValue() === moduleSpecifier);
  assert(declaration !== undefined, `Expected ${moduleSpecifier} import in ${source.getBaseName()}.`);
  const specifier = declaration.getNamedImports().find((candidate) => candidate.getName() === name);
  assert(specifier !== undefined, `Expected ${name} import from ${moduleSpecifier} in ${source.getBaseName()}.`);
  specifier.remove();
  if (declaration.getNamedImports().length === 0) {
    declaration.remove();
  }
}

const pathRewrites: ReadonlyArray<readonly [RegExp, string]> = [
  [/packages\/client\/src\/forms\/bound-fields\//gu, "packages/client/src/forms/editor/bound-fields/"],
  [/packages\/client\/src\/forms\/autosave-status\.tsx/gu, "packages/client/src/forms/editor/autosave-status.tsx"],
  [/packages\/client\/src\/forms\/capped-field\.tsx/gu, "packages/client/src/forms/editor/capped-field.tsx"],
  [/packages\/client\/src\/forms\/contexts\.ts/gu, "packages/client/src/forms/editor/contexts.ts"],
  [/packages\/client\/src\/forms\/create-autosave-entity-form\.tsx/gu, "packages/client/src/forms/editor/create-autosave-entity-form.tsx"],
  [/packages\/client\/src\/forms\/create-saved-entity-form\.ts/gu, "packages/client/src/forms/editor/create-saved-entity-form.ts"],
  [/packages\/client\/src\/forms\/section-save-status\.tsx/gu, "packages/client/src/forms/editor/section-save-status.tsx"],
  [/packages\/client\/src\/forms\/use-app-form\.ts/gu, "packages/client/src/forms/editor/use-app-form.ts"],
  [/tests\/client\/forms\/bound-fields\//gu, "tests/client/forms/editor/bound-fields/"],
  [/tests\/client\/forms\/create-autosave-entity-form-model\.test-d\.ts/gu, "tests/client/forms/editor/autosave-contract.test-d.ts"],
  [/forms\/bound-fields\//gu, "forms/editor/bound-fields/"],
  [/forms\/bound-fields(?=\))/gu, "forms/editor/bound-fields"],
  [/forms\/contexts\.ts/gu, "forms/editor/contexts.ts"],
  [/forms\/use-app-form\.ts/gu, "forms/editor/use-app-form.ts"],
  [/forms\/create-autosave-entity-form\.tsx/gu, "forms/editor/create-autosave-entity-form.tsx"],
  [/forms\/create-saved-entity-form\.ts/gu, "forms/editor/create-saved-entity-form.ts"],
  [/from `#forms`/gu, "from `#forms/editor`"],
  [/from #forms;/gu, "from #forms/editor;"],
  [/import \{ createAutosaveEntityForm \} from "#forms"/gu, 'import { createAutosaveEntityForm } from "#forms/editor"'],
  [/import \{ createSavedEntityForm \} from "#forms"/gu, 'import { createSavedEntityForm } from "#forms/editor"'],
];

const NATIVE_JSON_FOLLOWUPS = [
  ["biome.json", "packages/client/src/forms/use-app-form.ts", "packages/client/src/forms/editor/use-app-form.ts"],
  ["biome.json", "packages/client/src/forms/create-autosave-entity-form.tsx", "packages/client/src/forms/editor/create-autosave-entity-form.tsx"],
  [
    "tooling/src/verify/gates/suppressions.baseline.json",
    "packages/client/src/forms/bound-fields/select-field.tsx",
    "packages/client/src/forms/editor/bound-fields/select-field.tsx",
  ],
  [
    "tooling/src/verify/gates/suppressions.baseline.json",
    "packages/client/src/forms/bound-fields/switch-field.tsx",
    "packages/client/src/forms/editor/bound-fields/switch-field.tsx",
  ],
  [
    "tooling/src/verify/gates/suppressions.baseline.json",
    "packages/client/src/forms/create-saved-entity-form.ts",
    "packages/client/src/forms/editor/create-saved-entity-form.ts",
  ],
  ["tooling/src/verify/gates/suppressions.baseline.json", "packages/client/src/forms/use-app-form.ts", "packages/client/src/forms/editor/use-app-form.ts"],
  [
    "tooling/src/verify/gates/suppressions.baseline.json",
    "tests/client/forms/create-autosave-entity-form-model.test-d.ts",
    "tests/client/forms/editor/autosave-contract.test-d.ts",
  ],
] as const;

function assertNoMovedDoorImports(ctx: CodemodContext): void {
  for (const door of ["#forms", "@orb/client/forms"] as const) {
    const leftovers = ctx.project
      .getSourceFiles()
      .flatMap((source) => source.getImportDeclarations())
      .filter((declaration) => declaration.getModuleSpecifierValue() === door)
      .flatMap((declaration) => declaration.getNamedImports())
      .filter((specifier) => MOVED_PUBLIC_SYMBOLS.some((symbol) => symbol === specifier.getName()));
    assert(leftovers.length === 0, `Moved editor symbols still enter through ${door}: ${leftovers.map((specifier) => specifier.getName()).join(", ")}.`);
  }
}

function assertNativeJsonExcluded(ctx: CodemodContext): void {
  for (const path of ["biome.json", "tooling/src/verify/gates/suppressions.baseline.json"] as const) {
    assert(
      ctx.project.getSourceFile(join(ctx.repoRoot, path)) === undefined,
      `${path} entered the TypeScript codemod project; keep its path-only follow-up native.`,
    );
  }
}

await runCodemod(
  "type-worlds-forms-editor",
  (ctx) => {
    assertNativeJsonExcluded(ctx);
    const destinationByDoor = {
      "#forms": "#forms/editor",
      "@orb/client/forms": "@orb/client/forms/editor",
    } as const;
    for (const [from, destination] of Object.entries(destinationByDoor)) {
      ctx.plan(routeSymbolsByMap(ctx, from, Object.fromEntries(MOVED_PUBLIC_SYMBOLS.map((symbol) => [symbol, destination]))));
    }

    const model = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, `${FORMS}/create-autosave-entity-form-model.ts`));
    const factory = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, `${FORMS}/create-autosave-entity-form.tsx`));
    const savedFactory = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, `${FORMS}/create-saved-entity-form.ts`));
    const base = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, `${FORMS}/entity-form-base.ts`));
    const pureIndex = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, `${FORMS}/index.ts`));
    const contractDeclarations = CONTRACT_DECLARATIONS.map((name) => declarationByName(model, name));
    const contractText = contractDeclarations.map((declaration) => declaration.getFullText()).join("");
    const focus = base.getFunctionOrThrow("focusFirstInvalidField");
    const focusText = focus.getFullText();

    ctx.plan({
      description: "Split the Node-safe autosave model from its editor-owned browser contract",
      touchedFiles: [model.getFilePath(), join(ctx.repoRoot, `${EDITOR}/autosave-contract.ts`)],
      transform(inner) {
        removeNamedSpecifier(model, "react", "ReactNode");
        removeNamedSpecifier(model, "#state", "EntityDraftStore");
        const appFormImport = model.getImportDeclaration((candidate) => candidate.getModuleSpecifierValue() === "./use-app-form.ts");
        assert(appFormImport !== undefined, "Autosave model lost its AppForm contract import.");
        appFormImport.remove();
        for (const declaration of contractDeclarations) {
          declaration.remove();
        }
        const firstImport = model.getImportDeclarations()[0];
        assert(firstImport !== undefined, "Autosave model lost its import block.");
        model.replaceText(
          [0, firstImport.getStart()],
          "// The autosave session's Node-without-DOM state model: lifecycle derivation and teardown predicates.\n" +
            "// Browser factory, render-prop and AppForm-derived contracts live at forms/editor/autosave-contract.ts.\n" +
            "// These helpers remain internal to the factory and are deliberately absent from the #forms barrel.\n\n",
        );
        inner.project.createSourceFile(
          join(inner.repoRoot, `${EDITOR}/autosave-contract.ts`),
          "// Browser/editor contract for createAutosaveEntityForm; composes state-owned draft types and the pure autosave lifecycle.\n\n" +
            'import type { ReactNode } from "react";\n' +
            'import type { EntityDraftStore } from "#state";\n' +
            'import type { AutosaveSaveState } from "../create-autosave-entity-form-model.ts";\n' +
            'import type { AppFormInstance, AppFormOptions } from "../use-app-form.ts";\n' +
            contractText,
        );
      },
    });

    ctx.plan({
      description: "Move the exact first-invalid focus behavior into the editor owner",
      touchedFiles: [base.getFilePath(), join(ctx.repoRoot, `${EDITOR}/focus-invalid-field.ts`)],
      transform(inner) {
        focus.remove();
        const firstImport = base.getImportDeclarations()[0];
        assert(firstImport !== undefined, "Entity form base lost its import block.");
        base.replaceText(
          [0, firstImport.getStart()],
          "// Pure base shared by both entity-form factories: debounce, draft seed/mirror, baseline hash and value equality.\n" +
            "// Submit-invalid DOM focus lives in forms/editor/focus-invalid-field.ts.\n\n",
        );
        inner.project.createSourceFile(
          join(inner.repoRoot, `${EDITOR}/focus-invalid-field.ts`),
          "// The editor's submit-invalid focus effect. Keep the selector and optional focus semantics exact: the first\n" +
            "// rendered control declaring aria-invalid receives focus, and an absent control is a no-op.\n\n" +
            focusText,
        );
      },
    });

    ctx.plan(
      routeSymbolsByMap(
        ctx,
        "./create-autosave-entity-form-model.ts",
        Object.fromEntries(CONTRACT_DECLARATIONS.map((name) => [name, "./editor/autosave-contract.ts"])),
      ),
    );
    for (const source of [factory, savedFactory]) {
      const sourceSpecifier = source
        .getImportDeclarations()
        .find((declaration) => declaration.getNamedImports().some((specifier) => specifier.getName() === "focusFirstInvalidField"))
        ?.getModuleSpecifierValue();
      assert(sourceSpecifier === "./entity-form-base.ts", `Unexpected focus import in ${source.getBaseName()}: ${sourceSpecifier ?? "missing"}.`);
    }
    ctx.plan(routeSymbolsByMap(ctx, "./entity-form-base.ts", { focusFirstInvalidField: "./editor/focus-invalid-field.ts" }));

    ctx.plan({
      description: "Install the two explicit forms front doors with no compatibility re-exports",
      touchedFiles: [pureIndex.getFilePath(), join(ctx.repoRoot, `${EDITOR}/index.ts`)],
      transform(inner) {
        pureIndex.replaceWithText(PURE_INDEX);
        inner.project.createSourceFile(join(inner.repoRoot, `${EDITOR}/index.ts`), EDITOR_INDEX);
      },
    });

    const resetGate = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, "tooling/src/verify/gates/no-form-reset-in-autosave.ts"));
    const typeContractTest = ctx.project.getSourceFileOrThrow(join(ctx.repoRoot, `${TEST_FORMS}/create-autosave-entity-form-model.test-d.ts`));
    ctx.plan({
      description: "Retarget the reset seal and type-only contract proof to the new declaration owner",
      touchedFiles: [resetGate.getFilePath(), typeContractTest.getFilePath()],
      transform() {
        const oldGateText = resetGate.getFullText();
        const oldContractPath = "packages/client/src/forms/create-autosave-entity-form-model.ts";
        assert(
          oldGateText.split(oldContractPath).length - 1 === RESET_GATE_MODEL_PATH_ANCHORS,
          "Reset gate no longer carries exactly three model-owner path anchors.",
        );
        resetGate.replaceWithText(
          oldGateText
            .replaceAll(oldContractPath, "packages/client/src/forms/editor/autosave-contract.ts")
            .replaceAll("forms/create-autosave-entity-form-model.ts", "forms/editor/autosave-contract.ts")
            .replaceAll("`-model.ts`", "`autosave-contract.ts`"),
        );
        const oldTestText = typeContractTest.getFullText();
        assert(oldTestText.includes("the `-model.ts` TYPE home"), "Type-only autosave contract test lost its reviewed owner explanation.");
        typeContractTest.replaceWithText(oldTestText.replace("the `-model.ts` TYPE home", "the `autosave-contract.ts` TYPE home"));
      },
    });

    ctx.plan(repointAliasPaths(ctx, pathRewrites));
    ctx.plan(moveFiles(ctx, [...SOURCE_MOVES, ...TEST_MOVES]));

    assertNoMovedDoorImports(ctx);
    ctx.log(`Source moves: ${SOURCE_MOVES.length}; test/story moves: ${TEST_MOVES.length}.`);
    ctx.log(
      "Post-apply barrier: hand-add each applicable tracked old test path to docs/test-baseline/manifest.json deletions with a relocation reason, then run the fixed #1885 single writer.",
    );
    ctx.log("Single writer: pnpm exec node tooling/src/verify/cli.ts baseline test-baseline-manifest");
    ctx.log("Regenerate moved marker identities: pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population");
    ctx.log("Manual active-cite follow-up: Core-Enforcement-Active-Gates.md, autosave-form-doctrine.md, and the eslint.config.js bound-field comment.");
    for (const [file, from, to] of NATIVE_JSON_FOLLOWUPS) {
      ctx.log(`Native JSON follow-up (${file}, path/key only): ${from} -> ${to}`);
    }
  },
  {
    argv: process.argv.slice(2),
    setup: {
      replaceGlobs: [
        ...DEFAULT_GLOBS.map((glob) => `${process.cwd()}/${glob}`),
        `${process.cwd()}/tooling/src/**/*.ts`,
        `${process.cwd()}/vitest.config.ts`,
        `!${process.cwd()}/scripts/codemods/type-worlds-forms-editor.ts`,
      ],
    },
    maxOutputLines: 900,
  },
);
