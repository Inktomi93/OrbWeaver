#!/usr/bin/env tsx
// BRAND-F burn-down, phase 2: the PRODUCT half of the brand-in-name-position baseline, non-`handle`
// names (the handle corpus splits Handle/CharacterHandle per-site in phase 3). Retype only — NO
// diagnostic cast pass here: a castId in product code is legal only at a genuine untrusted seam, so
// every value-site error this pushes out is hand-resolved with judgment, never blanket-cast.
//
// Two call sets because the import spelling differs by package: kit files import their own ids module
// as `#ids` (packages/kit/src/macro/row-macros.ts is the precedent); every other package uses
// `@orb/kit/ids`.
//
// Exclusions: tests/scripts (phase 1 already swept tests), the SPANGATE lane's live files, the
// foundation/observability skip set, and the plugin wire-DTO files whose brand-named positions carry
// ratified `@foreign-id-ok` markers (assetId/characterId/chatId/pluginId — retyping those would
// launder a foreign wire's id into our brand).
//
// Run: pnpm tsx scripts/codemods/brandf-product-sweep.ts            (dry-run preview)
//      pnpm tsx scripts/codemods/brandf-product-sweep.ts --apply --no-diagnostics-check
import { retypeIdAnnotations, runCodemod } from "./codemod-kit.ts";

const SKIP_AND_MARKER_EXCLUDES: readonly string[] = [
  "tests/",
  "scripts/",
  "packages/kit/",
  "packages/ui/",
  "foundation/observability/",
  "domain/chat/engine/engine.ts",
  "domain/chat/verbs/turn.ts",
  "domain/workloads/engine/runner.ts",
  "entry/compose/search-discovery.ts",
  "contracts/src/plugin/",
  "server/src/domain/plugin/",
];

/** name-position → brand for every non-handle brand with product-side baseline sites. */
const PRODUCT_BRANDS: ReadonlyArray<{ readonly name: string; readonly brand: string }> = [
  { name: "chatId", brand: "ChatId" },
  { name: "characterId", brand: "CharacterId" },
  { name: "messageId", brand: "MessageId" },
  { name: "userId", brand: "UserId" },
  { name: "personaId", brand: "PersonaId" },
  { name: "presetId", brand: "PresetId" },
  { name: "workloadId", brand: "WorkloadId" },
  { name: "assetId", brand: "AssetId" },
  { name: "documentId", brand: "DocumentId" },
  { name: "externalId", brand: "ExternalId" },
];

/** The kit-side slice: kit's own two baseline rows, imported through kit's `#ids` subpath. */
const KIT_BRANDS: ReadonlyArray<{ readonly name: string; readonly brand: string }> = [
  { name: "assetId", brand: "AssetId" },
  { name: "chatId", brand: "ChatId" },
];
const KIT_EXCLUDES: readonly string[] = ["tests/", "scripts/", "packages/client/", "packages/server/", "packages/contracts/", "packages/db/", "packages/ui/", "kit/src/ids/"];

await runCodemod("brandf-product-sweep", (ctx) => {
  for (const { name, brand } of PRODUCT_BRANDS) {
    ctx.plan(
      retypeIdAnnotations(ctx, {
        names: [name],
        brand,
        importModule: "@orb/kit/ids",
        excludePathSubstrings: SKIP_AND_MARKER_EXCLUDES,
      }),
    );
  }
  for (const { name, brand } of KIT_BRANDS) {
    ctx.plan(
      retypeIdAnnotations(ctx, {
        names: [name],
        brand,
        importModule: "#ids",
        excludePathSubstrings: KIT_EXCLUDES,
      }),
    );
  }
});
