import type { ModelCatalogEntry } from "@orb/contracts/inference";
import type { FormatStringKey, GuidedActionKind, TemplateDef } from "@orb/contracts/preset";
import type { ProseSlotId } from "@orb/contracts/prose";
import type { WorkloadId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { expectTypeOf, test } from "vitest";
import type { HandWriteResult } from "#client/agent-seed/index.ts";
import type { ConfirmDialogProps } from "#client/components/confirm-dialog.tsx";
import type { CharacterFacetRowProps } from "#client/features/character/components/character-facet-row.tsx";
import type { ComposerGuidedClusterProps } from "#client/features/chat/components/composer-guided-cluster.tsx";
import type { ComposerSendControlProps } from "#client/features/chat/components/composer-send-control.tsx";
import type { ChatRowProjection } from "#client/features/chat/hooks/use-message-items.ts";
import type { SendGate } from "#client/features/chat/hooks/use-send-availability.ts";
import type { RowAttribution } from "#client/features/chat/lib/attribution.ts";
import type { CapabilityBadge } from "#client/features/credentials/lib/connection-editor-model.ts";
import type { ModelPickerView } from "#client/features/credentials/lib/model-picker-model.ts";
import type { UnderstandingPassView } from "#client/features/discovery/hooks/use-understanding-pass.ts";
import type { UpdateVerdict } from "#client/features/plugin/components/plugin-row-leaves.tsx";
import type { TemplateRow } from "#client/features/preset/lib/template-rows.ts";
import type { RegexPipelineStage } from "#client/features/regex/lib/regex-pipeline.ts";
import type { ImportSummary } from "#client/features/workloads/lib/portability-model.ts";

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

test("send refusal stays correlated through the hook and both control projections", () => {
  expectTypeOf<{ unavailable: true; reason: undefined; cause: null; failed: false }>().not.toExtend<SendGate>();
  expectTypeOf<{ unavailable: false; reason: undefined; cause: undefined; failed: true }>().toExtend<SendGate>();
  expectTypeOf<{ unavailable: false; reason: undefined; cause: null; failed: false }>().toExtend<SendGate>();
  expectTypeOf<{ unavailable: true; reason: string; cause: "no-connection"; failed: false }>().toExtend<SendGate>();
  expectTypeOf<{ unavailable: true; reason: undefined }>().not.toExtend<ComposerSendControlProps["availability"]>();
  expectTypeOf<{ unavailable: true; reason: undefined }>().not.toExtend<ComposerGuidedClusterProps["sendAvailability"]>();
  expectTypeOf<{ unavailable: false; reason: undefined }>().toExtend<ComposerSendControlProps["availability"]>();
  expectTypeOf<{ unavailable: true; reason: string }>().toExtend<ComposerGuidedClusterProps["sendAvailability"]>();
});

test("resolved attribution keeps absent, persona and character chrome distinct", () => {
  type Common = Pick<RowAttribution, "avatarHash" | "hueSeed">;
  expectTypeOf<Common & { name: null; kind: "persona"; avatarAssetId: null; tokens: null }>().not.toExtend<RowAttribution>();
  expectTypeOf<Common & { name: null; kind: null; avatarHash: string; avatarAssetId: null; tokens: null }>().not.toExtend<RowAttribution>();
  expectTypeOf<Common & { name: string; kind: "persona"; avatarAssetId: null; tokens: NonNullable<RowAttribution["tokens"]> }>().not.toExtend<RowAttribution>();
  expectTypeOf<Common & { name: null; kind: null; avatarHash: null; avatarAssetId: null; tokens: null }>().toExtend<RowAttribution>();
  expectTypeOf<Common & { name: string; kind: "persona"; avatarAssetId: null; tokens: null }>().toExtend<RowAttribution>();
  expectTypeOf<Common & { name: string; kind: "character"; avatarAssetId: null; tokens: null }>().toExtend<RowAttribution>();
});

test("a controlled confirm supplies its change callback without excluding a trigger", () => {
  type Common = Pick<ConfirmDialogProps, "title" | "onConfirm">;
  expectTypeOf<Common & { open: true }>().not.toExtend<ConfirmDialogProps>();
  expectTypeOf<Common & { onOpenChange: (open: boolean) => void }>().not.toExtend<ConfirmDialogProps>();
  expectTypeOf<Common>().toExtend<ConfirmDialogProps>();
  expectTypeOf<Common & { open: boolean; onOpenChange: (open: boolean) => void; trigger: ReactElement }>().toExtend<ConfirmDialogProps>();
});

test("an understanding pass run carries its identity while optional progress stays independent", () => {
  type Common = Pick<UnderstandingPassView, "detail" | "fraction" | "memoryDisabled" | "start" | "starting" | "onLiveProgress" | "confirm">;
  expectTypeOf<Common & { running: true; stage: null; liveRunId: null; failure: null; failureWasCrash: false }>().not.toExtend<UnderstandingPassView>();
  expectTypeOf<
    Common & { running: true; stage: string; liveRunId: WorkloadId; failure: string; failureWasCrash: false }
  >().not.toExtend<UnderstandingPassView>();
  expectTypeOf<Common & { running: true; stage: string; liveRunId: WorkloadId; failure: null; failureWasCrash: false }>().toExtend<UnderstandingPassView>();
  expectTypeOf<Common & { running: false; stage: null; liveRunId: null; failure: null; failureWasCrash: true }>().toExtend<UnderstandingPassView>();
});

test("minimal message readers retain the canonical ghost versus required-view relationship", () => {
  expectTypeOf<{ kind: "message" }>().not.toExtend<ChatRowProjection<"role">>();
  expectTypeOf<{ kind: "message" }>().not.toExtend<ChatRowProjection<"content">>();
  expectTypeOf<{ kind: "ghost" }>().toExtend<ChatRowProjection<"role">>();
  expectTypeOf<{ kind: "message"; view: { role: "user" } }>().toExtend<ChatRowProjection<"role">>();
  expectTypeOf<{ kind: "message"; view: { content: string } }>().toExtend<ChatRowProjection<"content">>();
});

test("the seeder cannot erase a hand-write refusal reason", () => {
  expectTypeOf<{ ok: false }>().not.toExtend<HandWriteResult>();
  expectTypeOf<{ ok: true; reason: string }>().not.toExtend<HandWriteResult>();
  expectTypeOf<{ ok: false; reason: string }>().toExtend<HandWriteResult>();
  expectTypeOf<{ ok: true }>().toExtend<HandWriteResult>();
});

test("template rows choose exactly one canonical form-address family", () => {
  type Common = Pick<TemplateRow, "factoryDefault">;
  expectTypeOf<TemplateRow>().not.toHaveProperty("guidedKind");
  expectTypeOf<TemplateRow>().not.toHaveProperty("proseSlotId");
  expectTypeOf<TemplateRow["def"]["id"]>().toEqualTypeOf<TemplateDef["id"]>();
  expectTypeOf<Common & { def: TemplateDef & { id: GuidedActionKind } }>().toExtend<TemplateRow>();
  expectTypeOf<Common & { def: TemplateDef & { id: ProseSlotId } }>().toExtend<TemplateRow>();
  expectTypeOf<Common & { def: TemplateDef & { id: FormatStringKey } }>().toExtend<TemplateRow>();
});

test("available plugin updates retain the canonical source-specific proof", () => {
  type Common = Pick<Extract<UpdateVerdict, { kind: "available" }>, "kind" | "label" | "ariaLabel">;
  type Proof = Extract<UpdateVerdict, { kind: "available" }>["proof"];
  type GitProof = Extract<Proof, { status: "source-changed" }>;
  type UrlProof = Extract<Proof, { source: "url" }>;
  expectTypeOf<Common & { proof: Omit<GitProof, "sourceCommit"> }>().not.toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: Omit<UrlProof, "bundleHash"> }>().not.toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: GitProof }>().toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: UrlProof }>().toExtend<UpdateVerdict>();
  expectTypeOf<Common & { proof: Extract<Proof, { source: "showcase" }> }>().toExtend<UpdateVerdict>();
});

test("a skipped regex pipeline step has neither execution errors nor matches", () => {
  type Common = Pick<RegexPipelineStage, "key" | "name" | "isSubject" | "isAppended" | "before" | "after">;
  expectTypeOf<Common & { skipped: "disabled"; matchCount: 1; error: null }>().not.toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { skipped: "disabled"; matchCount: 0; error: string }>().not.toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { skipped: "disabled"; matchCount: 0; error: null }>().toExtend<RegexPipelineStage>();
  expectTypeOf<Common & { skipped: null; matchCount: number; error: string | null }>().toExtend<RegexPipelineStage>();
});

test("import failures cannot carry successful skipped-plane notes", () => {
  type Outcome = ImportSummary["outcomes"][number];
  type Common = Pick<Outcome, "path" | "detail">;
  expectTypeOf<Common & { ok: false; notes: readonly string[] }>().not.toExtend<Outcome>();
  expectTypeOf<Common & { ok: false }>().toExtend<Outcome>();
  expectTypeOf<Common & { ok: true }>().toExtend<Outcome>();
  expectTypeOf<Common & { ok: true; notes: readonly string[] }>().toExtend<Outcome>();
});

test("a facet row cannot disagree with the presence of its preview", () => {
  type Common = Pick<CharacterFacetRowProps, "facet" | "selected" | "fillSummary" | "focusOnMount" | "onSelect">;
  expectTypeOf<Common & { filled: true; preview: null }>().not.toExtend<CharacterFacetRowProps>();
  expectTypeOf<Common & { filled: false; preview: string }>().not.toExtend<CharacterFacetRowProps>();
  expectTypeOf<Common & { filled: true; preview: string }>().toExtend<CharacterFacetRowProps>();
  expectTypeOf<Common & { filled: false; preview: null }>().toExtend<CharacterFacetRowProps>();
});
