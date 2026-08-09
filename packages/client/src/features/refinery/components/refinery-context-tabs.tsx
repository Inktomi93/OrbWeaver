// The three refinery CONTEXT tab BODIES (Runs · Setup · Versions) — mounted by the section's
// `defineContextTabs` defs (built in `lib/refinery-section.tsx`; a component module exports ONLY
// components, so the def ARRAY lives with the section). Each body reads its OWN data by the projection's
// ids (the cache dedupes across panes); the Runs tab's actions drive CONTENT's walker through the state
// commons (`refinery-view-store` — the feature's Content↔Context channel).

import type { ReactElement } from "react";
import { useState } from "react";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { RefineryContextState } from "#lib";
import { setRefineryArmedRewrite, setRefineryViewedRun, useRefineryArmedRewriteId, useRefineryViewedRunId } from "#state";
import { useRunRefineryStage, useUpdateRefinerySession } from "../hooks/use-refinery-mutations.ts";
import { useRefineryPreflight, useRefinerySchemas } from "../hooks/use-refinery-schemas.ts";
import { useRefineryRuns, useRefinerySession } from "../hooks/use-refinery-sessions.ts";
import { RunsTab, SetupTab, VersionsTab } from "./context-tabs.tsx";
import { SchemaEditorDialog } from "./schema-editor-dialog.tsx";
import { ScopeEditorDialog } from "./scope-editor-dialog.tsx";

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
type PreflightView = ReturnType<typeof useRefineryPreflight>["data"];
type SchemaSummaries = ReturnType<typeof useRefinerySchemas>["data"];

/** A custom stage config's display name out of the library roster (or its missing-row honest state). */
function customNameOf(config: SessionView["stageConfig"]["score"] | SessionView["stageConfig"]["analyze"], schemas: SchemaSummaries): string | null {
  if (config.kind !== "custom") {
    return null;
  }
  return schemas?.find((s) => s.id === config.schemaId)?.name ?? "custom (missing)";
}

function schemaLineOf(scoreName: string | null, analyzeName: string | null): string {
  if (scoreName === null && analyzeName === null) {
    return "Fixed (built-in)";
  }
  return `score: ${scoreName ?? "fixed"} · analyze: ${analyzeName ?? "fixed"}`;
}

function stageModesLineOf(view: SessionView): string {
  const scoreMode = view.stageConfig.score.kind === "fixed" ? view.stageConfig.score.mode : "custom";
  const analyzeMode = view.stageConfig.analyze.kind === "fixed" ? view.stageConfig.analyze.mode : "custom";
  return `score ${scoreMode} · rewrite ${view.stageConfig.rewrite.mode} · analyze ${analyzeMode}`;
}

function fitLineOf(preflight: PreflightView): string | null {
  const inputFit = preflight?.stages.find((s) => s.stage === "score");
  if (inputFit === undefined) {
    return null;
  }
  const ceiling = preflight?.contextTokens === null || preflight?.contextTokens === undefined ? "" : ` / ${preflight.contextTokens}`;
  return `≈ ${inputFit.inputEstimate}${ceiling} tok`;
}

export function SetupTabBody({ state }: { state: RefineryContextState }): ReactElement | null {
  const trpc = useTRPC();
  const session = useRefinerySession(state.sessionId);
  const preflight = useRefineryPreflight(state.sessionId);
  const schemas = useRefinerySchemas();
  const character = useGatedQuery(session.data?.characterId ?? null, (id) => trpc.character.get.queryOptions({ characterId: id }));
  const invalidation = useInvalidation();
  const updateSession = useUpdateRefinerySession({ trpc, invalidation });
  const [configOpen, setConfigOpen] = useState(false);
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false);
  if (session.data === undefined) {
    return null;
  }
  const view = session.data;
  return (
    <>
      <SetupTab
        anchorLine={`Pinned at session start · ${view.originalCard.greetings.length} greetings`}
        fitLine={fitLineOf(preflight.data)}
        guidance={view.guidance}
        onEditConfig={(): void => setSchemaEditorOpen(true)}
        onEditGuidance={(): void => setConfigOpen(true)}
        onViewOriginal={(): void => setRefineryViewedRun(null)}
        schemaLine={schemaLineOf(customNameOf(view.stageConfig.score, schemas.data), customNameOf(view.stageConfig.analyze, schemas.data))}
        stageModesLine={stageModesLineOf(view)}
      />
      {character.data !== undefined ? (
        <ScopeEditorDialog
          card={character.data}
          onOpenChange={setConfigOpen}
          onSave={(selection): void => updateSession.mutate({ sessionId: state.sessionId, patch: { selection } })}
          open={configOpen}
          score={null}
          selection={view.selection}
        />
      ) : null}
      <SchemaEditorDialog
        editing={null}
        onOpenChange={setSchemaEditorOpen}
        onSaved={(schemaId): void => {
          updateSession.mutate({ sessionId: state.sessionId, patch: { stageConfig: { ...view.stageConfig, score: { kind: "custom", schemaId } } } });
        }}
        open={schemaEditorOpen}
        stage="score"
      />
    </>
  );
}

export function VersionsTabBody({ state }: { state: RefineryContextState }): ReactElement {
  const trpc = useTRPC();
  const character = useGatedQuery(state.characterId, (id) => trpc.character.get.queryOptions({ characterId: id }));
  return <VersionsTab liveDescription={character.data?.description ?? ""} state={state} />;
}
