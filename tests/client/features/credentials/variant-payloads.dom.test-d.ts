import type { ModelCatalogEntry } from "@orb/contracts/inference";
import { expectTypeOf, test } from "vitest";
import type { CapabilityBadge } from "#client/features/credentials/lib/connection-editor-model.ts";
import type { ModelPickerView } from "#client/features/credentials/lib/model-picker-model.ts";

test("capability badge success and refusal retain their reason contract", () => {
  type Base = Pick<CapabilityBadge, "task" | "label">;
  expectTypeOf<Base & { ok: true; reason: string }>().not.toExtend<CapabilityBadge>();
  expectTypeOf<Base & { ok: false; reason: null }>().not.toExtend<CapabilityBadge>();
  expectTypeOf<Base & { ok: true; reason: null }>().toExtend<CapabilityBadge>();
  expectTypeOf<Base & { ok: false; reason: string }>().toExtend<CapabilityBadge>();
});

test("model picker list, loading and fallback payloads cannot be mixed", () => {
  interface Quiet {
    warns: false;
    typingOffered: false;
    retry: null;
  }
  expectTypeOf<Quiet & { models: ModelCatalogEntry[]; notice: string }>().not.toExtend<ModelPickerView>();
  expectTypeOf<{ models: null; notice: null; warns: true; typingOffered: false; retry: null }>().not.toExtend<ModelPickerView>();
  expectTypeOf<Quiet & { models: null; notice: null }>().toExtend<ModelPickerView>();
  expectTypeOf<Quiet & { models: ModelCatalogEntry[]; notice: null }>().toExtend<ModelPickerView>();
  expectTypeOf<{ models: null; notice: string; warns: boolean; typingOffered: boolean; retry: (() => void) | null }>().toExtend<ModelPickerView>();
});
