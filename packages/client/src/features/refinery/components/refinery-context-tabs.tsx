// The three refinery CONTEXT tab BODIES (Runs · Setup · Versions) — mounted by the section's
// `defineContextTabs` defs (built in `lib/refinery-section.tsx`; a component module exports ONLY
// components, so the def ARRAY lives with the section). Each body reads its OWN data by the projection's
// ids (the cache dedupes across panes); the Runs tab's actions drive CONTENT's walker through the state
// commons (`refinery-view-store` — the feature's Content↔Context channel).

import type { RefinerySchemaStage, RefineryStageConfig } from "@orb/contracts/refinery";
import type { RefinerySchemaId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { RefineryContextState } from "#lib";
import { requestRefineryWorkbenchDoor, setRefineryArmedRewrite, setRefineryViewedRun, useRefineryArmedRewriteId, useRefineryViewedRunId } from "#state";
import { useRunRefineryStage, useUpdateRefinerySession } from "../hooks/use-refinery-mutations.ts";
import { useRefinerySchemas } from "../hooks/use-refinery-schemas.ts";
import { useRefineryRuns, useRefinerySession } from "../hooks/use-refinery-sessions.ts";
import { RunsTab, SetupTab, VersionsTab } from "./context-tabs.tsx";
import type { SchemaEditorDialogProps } from "./schema-editor-dialog.tsx";
import { SchemaEditorDialog } from "./schema-editor-dialog.tsx";

export function RunsTabBody({ state }: { state: RefineryContextState }): ReactElement {
  const runs = useRefineryRuns(state.sessionId);
  const viewedRunId = useRefineryViewedRunId();
  const armedRewriteId = useRefineryArmedRewriteId();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const runStage = useRunRefineryStage({ trpc, invalidation });
  return (
    <RunsTab
      armedRewriteId={armedRewriteId}
      onArmRewrite={setRefineryArmedRewrite}
      onRunScore={(): void => runStage.mutate({ sessionId: state.sessionId, stage: "score" })}
      onView={(run): void => setRefineryViewedRun(run.id)}
      runs={runs.data ?? []}
      viewedRunId={viewedRunId}
    />
  );
}

type SessionView = NonNullable<ReturnType<typeof useRefinerySession>["data"]>;
type SchemaSummaries = ReturnType<typeof useRefinerySchemas>["data"];

/** A custom stage config's display name out of the library roster (or its missing-row honest state). */
function customNameOf(config: SessionView["stageConfig"]["score"] | SessionView["stageConfig"]["analyze"], schemas: SchemaSummaries): string | null {
  if (config.kind !== "custom") {
    return null;
  }
  return schemas?.find((s) => s.id === config.schemaId)?.name ?? "custom (missing)";
}

/** ONE stage's payload-schema readout — the custom row's name, or the fixed-built-in state. Per stage now
 *  (each has its own Setup row + editor door); the old combined `score: X · analyze: Y` string could only
 *  read out, never route the two verbs to their stages. */
function stageSchemaLineOf(customName: string | null): string {
  return customName ?? "Fixed (built-in)";
}

/** Resolve the EDITING target for a stage: the saved library row behind a `custom` config (so the editor
 *  opens in EDIT mode over its real name/description/schema), or `null` to author a fresh one. */
function editingRowOf(config: RefineryStageConfig["score"] | RefineryStageConfig["analyze"], schemas: SchemaSummaries): SchemaEditorDialogProps["editing"] {
  if (config.kind !== "custom") {
    return null;
  }
  const row = schemas?.find((s) => s.id === config.schemaId);
  return row === undefined ? null : { id: row.id, name: row.name, description: row.description, schema: row.schema };
}

/** Point a stage's config at a newly-saved custom schema. Literal-key branch (not a computed `[stage]`),
 *  the shell-store `patchPanels` precedent — a computed key widens to a string index that won't assign to
 *  the discriminated stage-config record. */
function stageCustomPatch(stageConfig: RefineryStageConfig, stage: RefinerySchemaStage, schemaId: RefinerySchemaId): RefineryStageConfig {
  const custom = { kind: "custom", schemaId } as const;
  return stage === "score" ? { ...stageConfig, score: custom } : { ...stageConfig, analyze: custom };
}

function stageModesLineOf(view: SessionView): string {
  const scoreMode = view.stageConfig.score.kind === "fixed" ? view.stageConfig.score.mode : "custom";
  const analyzeMode = view.stageConfig.analyze.kind === "fixed" ? view.stageConfig.analyze.mode : "custom";
  return `score ${scoreMode} · rewrite ${view.stageConfig.rewrite.mode} · analyze ${analyzeMode}`;
}

// PROMPT FIT LEFT THIS PANE (#158 item 2, 2026-08-17 — the one-home ruling). `fitLineOf`/`fitWarnOf` used
// to derive a `≈ N/M tok` line here from the SCORE stage's slice alone, beside `LaneRunControl`'s per-stage
// `in ≈ … · out ≈ …` on the same screen. It was never a second copy of one datum so much as a third of one:
// the lane prints both directions and both ceilings, per stage, next to the verb whose budget it is. The
// `fitWarn` half existed only to stop the two homes DISAGREEING (side-eye P2, "CONTEXT drops the ⚠");
// deleting the second home closes that for good rather than keeping the two in sync forever.

/** The scope row's readout — the selected fields, with the greeting slots spelled out when the
 *  selection narrows them (the roster line the row previously did not carry at all). */
function scopeLineOf(view: SessionView): string {
  const { fields, greetingIndexes } = view.selection;
  if (fields.length === 0) {
    return "nothing selected — a run has nothing to work on";
  }
  return fields.map((f) => (f === "greetings" && greetingIndexes !== undefined ? `greetings ${greetingIndexes.join(",")}` : f)).join(" · ");
}

export function SetupTabBody({ state }: { state: RefineryContextState }): ReactElement | null {
  const trpc = useTRPC();
  const session = useRefinerySession(state.sessionId);
  const schemas = useRefinerySchemas();
  const invalidation = useInvalidation();
  const updateSession = useUpdateRefinerySession({ trpc, invalidation });
  // The schema editor is opened AT A STAGE (score / analyze) and possibly over an existing row to EDIT.
  // `null` = closed. Conditionally mounted (not an always-mounted `open` bool) so switching stage/target
  // gives the dialog fresh internal state — its description/schemaText seed from `editing` at mount only.
  const [schemaEditor, setSchemaEditor] = useState<{ readonly stage: RefinerySchemaStage; readonly editing: SchemaEditorDialogProps["editing"] } | null>(null);
  if (session.data === undefined) {
    return null;
  }
  const view = session.data;
  function openSchemaEditor(stage: RefinerySchemaStage): void {
    const config = stage === "score" ? view.stageConfig.score : view.stageConfig.analyze;
    setSchemaEditor({ stage, editing: editingRowOf(config, schemas.data) });
  }
  return (
    <>
      <SetupTab
        analyzeSchemaLine={stageSchemaLineOf(customNameOf(view.stageConfig.analyze, schemas.data))}
        anchorLine={`Pinned at session start · ${view.originalCard.greetings.length} greetings`}
        guidance={view.guidance}
        onEditSchema={openSchemaEditor}
        // #171 — the doors: this pane READS scope and guidance and now knocks on the workbench control
        // that owns each, instead of printing a sentence naming it. The request travels the same
        // Content↔Context commons the Runs tab's actions already use.
        onOpenDoor={requestRefineryWorkbenchDoor}
        onViewOriginal={(): void => setRefineryViewedRun(null)}
        scopeLine={scopeLineOf(view)}
        scoreSchemaLine={stageSchemaLineOf(customNameOf(view.stageConfig.score, schemas.data))}
        stageModesLine={stageModesLineOf(view)}
      />
      {/* THE SECOND SCOPE EDITOR LEFT WITH ITS ROW (#158 item 1). This body used to mount its OWN
          `ScopeEditorDialog` — with `score={null}`, so it could not show the score-informed hints
          CONTENT's copy does — beside CONTENT's, which is the "two independently-editable homes inches
          apart" the issue is about. The workbench keeps the door; this pane keeps the readout. The card
          read (`character.get`) went with it: it was here only to feed that dialog. */}
      {schemaEditor !== null ? (
        <SchemaEditorDialog
          editing={schemaEditor.editing}
          onOpenChange={(open): void => {
            if (!open) {
              setSchemaEditor(null);
            }
          }}
          onSaved={(schemaId): void => {
            updateSession.mutate({ sessionId: state.sessionId, patch: { stageConfig: stageCustomPatch(view.stageConfig, schemaEditor.stage, schemaId) } });
          }}
          open={true}
          stage={schemaEditor.stage}
        />
      ) : null}
    </>
  );
}

export function VersionsTabBody({ state }: { state: RefineryContextState }): ReactElement {
  const trpc = useTRPC();
  const character = useGatedQuery(state.characterId, (id) => trpc.character.get.queryOptions({ characterId: id }));
  return <VersionsTab liveDescription={character.data?.description ?? ""} state={state} />;
}
