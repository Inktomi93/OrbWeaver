// The Regex settings surface — THE SCRIPT LIBRARY (Settings → Regex). D121-E turned this from a form over
// `UserSettings.regex.scripts` (one embedded blob among three) into real CRUD over `regex_scripts` rows,
// with a per-row GLOBAL toggle standing in for what the old blob's mere existence used to mean.
//
// WHAT THE USER GAINS, concretely: a script authored here can now be attached to a preset, a character, or
// a room from those surfaces' pickers — the same row, running once — where the old shape forced a fresh
// copy per carrier and gave each carrier a different editor. The "global" switch is the only scope this
// surface owns; the other three are attached from the thing they belong to.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { RegexScriptFormValues } from "#components";
import { EntryListEditor, RegexEditorDialog } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { AutosaveStatus } from "#forms";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { useAttachRegexGlobal, useCreateRegexScript, useDetachRegexGlobal, useRemoveRegexScript, useUpdateRegexScript } from "../hooks/use-regex-library";
import { makeRegexScriptDefaults, RegexScriptForm } from "../hooks/use-regex-script-form";
import { REGEX_SUBCATEGORY_IDS } from "../lib/regex-nav";

/** Strip a row down to the authored fields the editor binds (id is identity, not content). */
function toFormValues(row: RegexScriptRow): RegexScriptFormValues {
  const { id: _id, ...authored } = row;
  return authored;
}

/** The Regex panel body (rendered inside the settings modal's Dialog). */
export function RegexSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} className="outline-none" tabIndex={-1}>
      <QueryBoundary
        fallback={<Text voice="gloss">Loading your regex scripts…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your regex scripts" onRetry={retry} />}
      >
        <Container>
          <RegexLibraryPanel />
        </Container>
      </QueryBoundary>
    </Stack>
  );
}

/** The library list: rows from `regex.listScripts`, global membership from `regex.listGlobal`. */
function RegexLibraryPanel(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const create = useCreateRegexScript({ trpc, invalidation });
  const remove = useRemoveRegexScript({ trpc, invalidation });
  const [editId, setEditId] = useState<RegexScriptId | null>(null);

  const globalIds = new Set(globals.map((row) => row.id));
  const editIndex = editId === null ? null : scripts.findIndex((row) => row.id === editId);

  const onAdd = (): void => {
    void create.mutateAsync({ input: makeRegexScriptDefaults() }).then((row) => {
      setEditId(row.id);
    });
  };

  return (
    <Stack gap="section" id={settingsAnchorId("regex", REGEX_SUBCATEGORY_IDS.scripts)}>
      <EntryListEditor
        addLabel="Add script"
        // A row the list no longer holds (deleted on another device mid-edit) yields -1; treat that as
        // "no editor open" rather than rendering an editor over an absent row.
        editIndex={editIndex === -1 ? null : editIndex}
        emptyText="No scripts yet."
        getSubtitle={(script): string => scriptSubtitle(script, globalIds.has(script.id))}
        getTitle={(script): string => (script.name === "" ? "Unnamed script" : script.name)}
        heading="Scripts"
        helperText="Your find/replace library. Scripts marked GLOBAL run in every chat you host; the rest run only where a preset, character, or room attaches them."
        items={scripts}
        onAdd={onAdd}
        onEdit={(index): void => {
          const row = scripts[index];
          if (row !== undefined) {
            setEditId(row.id);
          }
        }}
        onRemove={(index): void => {
          const row = scripts[index];
          if (row !== undefined) {
            void remove.mutateAsync({ scriptId: row.id });
          }
        }}
        renderEditor={(index): ReactElement | null => {
          const row = scripts[index];
          return row === undefined ? null : <RegexScriptEditor row={row} onClose={(): void => setEditId(null)} />;
        }}
      />
      <GlobalScopeList scripts={scripts} globalIds={globalIds} />
    </Stack>
  );
}

/** One row's subtitle — the enable state plus the stages it bites at, in the readout's own words (the F-23
 *  one-vocabulary rule), plus the GLOBAL marker so the scope is legible without opening the editor. */
function scriptSubtitle(script: RegexScriptRow, isGlobal: boolean): string {
  const state = script.enabled ? "on" : "off";
  const scope = isGlobal ? "global" : "attached only";
  return `${state} · ${scope}`;
}

/** The per-row editor — an autosave form keyed by the script's own id, saving through `updateScript`. */
function RegexScriptEditor({ row, onClose }: { readonly row: RegexScriptRow; readonly onClose: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateRegexScript({ trpc, invalidation });

  const save = (values: RegexScriptFormValues): Promise<unknown> => update.mutateAsync({ scriptId: row.id, input: values });

  return (
    <RegexScriptForm entityId={row.id} serverValues={toFormValues(row)} save={save}>
      {(session): ReactElement => <RegexScriptEditorBody session={session} onClose={onClose} />}
    </RegexScriptForm>
  );
}

function RegexScriptEditorBody({ session, onClose }: { readonly session: AutosaveSession<RegexScriptFormValues>; readonly onClose: () => void }): ReactElement {
  return (
    <Stack gap="field">
      <RegexEditorDialog form={session.form} onClose={onClose} />
      <Row gap="field" align="center">
        <AutosaveStatus state={session.saveState} onRetry={session.retrySave} caption="Synced across your devices." />
      </Row>
    </Stack>
  );
}

/** The GLOBAL scope switches — the one scope this surface owns (preset/character/room attach from their own
 *  pickers). A switch row per library script, so "which of my scripts run everywhere" is one glance. */
function GlobalScopeList({
  scripts,
  globalIds,
}: {
  readonly scripts: readonly RegexScriptRow[];
  readonly globalIds: ReadonlySet<RegexScriptId>;
}): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachRegexGlobal({ trpc, invalidation });
  const detach = useDetachRegexGlobal({ trpc, invalidation });

  if (scripts.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      <Text voice="kicker">Runs everywhere</Text>
      <Text voice="gloss">Global scripts apply to every chat you host, before any preset, character, or room script.</Text>
      {scripts.map((script) => (
        <Row key={script.id} gap="field" align="center" justify="between">
          <Text>{script.name === "" ? "Unnamed script" : script.name}</Text>
          <Switch
            aria-label={`${script.name === "" ? "Unnamed script" : script.name} runs in every chat`}
            checked={globalIds.has(script.id)}
            onCheckedChange={(checked): void => {
              if (checked) {
                void attach.mutateAsync({ scriptId: script.id });
              } else {
                void detach.mutateAsync({ scriptId: script.id });
              }
            }}
          />
        </Row>
      ))}
    </Stack>
  );
}
