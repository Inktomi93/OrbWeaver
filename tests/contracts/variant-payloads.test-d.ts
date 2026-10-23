import type { PluginCommandArgSpec, SnippetResult } from "@orb/contracts/plugin";
import type { PortableImportOutcome } from "@orb/contracts/portability";
import type { EndpointInspection } from "@orb/contracts/providers";
import type { SettingsImportOutcome } from "@orb/contracts/settings";
import type { BulkImportLorebookResult } from "@orb/contracts/world-info";
import { expectTypeOf, test } from "vitest";

test("import outcomes retain successful accounting without permitting contradictory failures", () => {
  expectTypeOf<{ ok: true }>().toExtend<PortableImportOutcome>();
  expectTypeOf<{ ok: false; error: string }>().toExtend<PortableImportOutcome>();
  expectTypeOf<{ ok: false }>().not.toExtend<PortableImportOutcome>();
  expectTypeOf<{ ok: true; error: string }>().not.toExtend<PortableImportOutcome>();
  expectTypeOf<{ ok: false; error: string; created: true }>().not.toExtend<PortableImportOutcome>();
  expectTypeOf<{ ok: false; error: string; landed: [] }>().not.toExtend<SettingsImportOutcome>();
});

test("endpoint success, snippet classification and enum payloads preserve their discriminants", () => {
  expectTypeOf<Extract<EndpointInspection, { ok: true }>["response"]>().not.toBeNullable();
  expectTypeOf<{ logLines: []; errorKind: "parse" }>().not.toExtend<SnippetResult>();
  expectTypeOf<{ logLines: []; error: string }>().toExtend<SnippetResult>();
  expectTypeOf<{ name: "mode"; type: "enum" }>().not.toExtend<PluginCommandArgSpec>();
  expectTypeOf<{ name: "mode"; type: "enum"; enumValues: readonly string[] }>().toExtend<PluginCommandArgSpec>();
  expectTypeOf<{ name: "count"; type: "number"; enumValues: readonly string[] }>().not.toExtend<PluginCommandArgSpec>();
});

test("lorebook creation and replacement cannot both be true", () => {
  type Landing = Pick<BulkImportLorebookResult, "worldBookId" | "entryCount" | "name" | "renamedFrom">;
  expectTypeOf<Landing & { created: true; replaced: true }>().not.toExtend<BulkImportLorebookResult>();
  expectTypeOf<Landing & { created: true; replaced: false }>().toExtend<BulkImportLorebookResult>();
  expectTypeOf<Landing & { created: false; replaced: true }>().toExtend<BulkImportLorebookResult>();
  expectTypeOf<Landing & { created: false; replaced: false }>().toExtend<BulkImportLorebookResult>();
});
