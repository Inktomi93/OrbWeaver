// The Regex settings surface — THE SCRIPT LIBRARY (Settings → Regex). D121-E turned this from a form over
// `UserSettings.regex.scripts` (one embedded blob among three) into real CRUD over `regex_scripts` rows,
// with a per-row GLOBAL toggle standing in for what the old blob's mere existence used to mean.
//
// WHAT THE USER GAINS, concretely: a script authored here can now be attached to a preset, a character, or
// a room from those surfaces' pickers — the same row, running once — where the old shape forced a fresh
// copy per carrier and gave each carrier a different editor. The "global" switch is the only scope this
// surface owns; the other three are attached from the thing they belong to.
//
// ONE LIST, ONE ROW PER SCRIPT (side-eye X-6, 2026-08-03). This pane used to render every script TWICE:
// a `SCRIPTS` list with the row's subtitle and a Remove, and — ~400px lower, past its own row — a second
// `RUNS EVERYWHERE` list of the SAME rows, name-only, each with the global switch. To make a script global
// you scrolled past it to a copy of it, and because the second list carried no subtitle, six same-named
// scripts were six indistinguishable switches. The global scope is a PROPERTY OF THE ROW, so it is now the
// row's own trailing control (`renderRowAction`) and the second list is gone; its helper sentence survives
// as the list's helper line, which is where the explanation always belonged.
//
// AND THE PANE NAMES ITSELF (side-eye X-5). Its only content was an `EntryListEditor`, which correctly
// renders its group name as a 10.5px KICKER (the F-8 ruling) — so every text node on the pane was 10.5px
// muted and the pane read unlabeled beside Personas / Tags / Chat behavior, each of which opens with a 16px
// title. The SECTION title is the pane frame's job; the kicker stays the group's.

import type { CreateRegexScriptInput, RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, RefObject } from "react";
import { useRef, useState } from "react";
import { EntryListEditor, RegexEditorDialog } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { AutosaveStatus } from "#forms";
import { regexScriptScent, useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { useAttachRegexGlobal, useCreateRegexScript, useDetachRegexGlobal, useRemoveRegexScript, useUpdateRegexScript } from "../hooks/use-regex-library";
import { makeRegexScriptDefaults, RegexScriptForm } from "../hooks/use-regex-script-form";
import { withDerivedTierFlags } from "../lib/derive-tier-flags";
import { REGEX_SUBCATEGORY_IDS } from "../lib/regex-nav";

/** Strip a row down to the authored fields the editor binds (id is identity, not content). */
function toFormValues(row: RegexScriptRow): CreateRegexScriptInput {
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
  // WHAT FOCUS RETURNS TO when the editor closes (side-eye X-8) — captured at the click, because by the
  // time the dialog mounts the activeElement is already inside it.
  const openerRef = useRef<HTMLElement | null>(null);
  const rememberOpener = (): void => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const globalIds = new Set(globals.map((row) => row.id));
  const editIndex = editId === null ? null : scripts.findIndex((row) => row.id === editId);

  const onAdd = (): void => {
    rememberOpener();
    void create.mutateAsync({ input: makeRegexScriptDefaults() }).then((row) => {
      setEditId(row.id);
    });
  };

  return (
    <Section heading="Regex scripts" id={settingsAnchorId("regex", REGEX_SUBCATEGORY_IDS.scripts)}>
      <EntryListEditor
        addLabel="Add script"
        // A row the list no longer holds (deleted on another device mid-edit) yields -1; treat that as
        // "no editor open" rather than rendering an editor over an absent row.
        editIndex={editIndex === -1 ? null : editIndex}
        emptyText="No scripts yet."
        getSubtitle={regexScriptScent}
        getTitle={scriptTitle}
        heading="Scripts"
        helperText="Your find/replace library. A script marked “runs in every chat” applies to every chat you host; the rest run only where a preset, character, or room attaches them."
        items={scripts}
        onAdd={onAdd}
        onEdit={(index): void => {
          const row = scripts[index];
          if (row !== undefined) {
            rememberOpener();
            setEditId(row.id);
          }
        }}
        onRemove={(index): void => {
          const row = scripts[index];
          if (row !== undefined) {
            void remove.mutateAsync({ scriptId: row.id });
          }
        }}
        removeDescription="Deleting a script removes it from every preset, character, and room it is attached to. This can't be undone."
        renderEditor={(index): ReactElement | null => {
          const row = scripts[index];
          return row === undefined ? null : <RegexScriptEditor finalFocus={openerRef} row={row} onClose={(): void => setEditId(null)} />;
        }}
        renderRowAction={(script): ReactElement => <GlobalScopeSwitch isGlobal={globalIds.has(script.id)} script={script} />}
      />
    </Section>
  );
}

/** A row's name, with the empty-name arm spelled once (the list, the switch label and the confirm all read
 *  the same string, so a nameless row can never announce three different ways). */
function scriptTitle(script: RegexScriptRow): string {
  return script.name === "" ? "Unnamed script" : script.name;
}

/** The per-row editor — an autosave form keyed by the script's own id, saving through `updateScript`.
 *
 *  THE ONE TIER-FLAG WRITE BOUNDARY (side-eye X-1/X-2): `markdownOnly`/`promptOnly` are re-derived from the
 *  placement chips on every save, so the pair can never disagree with the chips or with each other. That
 *  also HEALS an ST-imported row carrying contradictory flags the first time it is edited here — which is
 *  the only place they are ever rewritten (`derive-tier-flags.ts` states why the import lift is left alone). */
function RegexScriptEditor({
  row,
  onClose,
  finalFocus,
}: {
  readonly row: RegexScriptRow;
  readonly onClose: () => void;
  readonly finalFocus: RefObject<HTMLElement | null>;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateRegexScript({ trpc, invalidation });

  const save = (values: CreateRegexScriptInput): Promise<unknown> => update.mutateAsync({ scriptId: row.id, input: withDerivedTierFlags(values) });

  return (
    <RegexScriptForm entityId={row.id} serverValues={toFormValues(row)} save={save}>
      {(session): ReactElement => <RegexScriptEditorBody finalFocus={finalFocus} session={session} onClose={onClose} />}
    </RegexScriptForm>
  );
}

function RegexScriptEditorBody({
  session,
  onClose,
  finalFocus,
}: {
  readonly session: AutosaveSession<CreateRegexScriptInput>;
  readonly onClose: () => void;
  readonly finalFocus: RefObject<HTMLElement | null>;
}): ReactElement {
  return (
    <Stack gap="field">
      <RegexEditorDialog finalFocus={finalFocus} form={session.form} onClose={onClose} />
      <Row gap="field" align="center">
        <AutosaveStatus state={session.saveState} onRetry={session.retrySave} caption="Synced across your devices." />
      </Row>
    </Stack>
  );
}

/** The GLOBAL scope switch — the one scope this surface owns (preset/character/room attach from their own
 *  pickers), riding the ROW it belongs to rather than a second list of the same six names (side-eye X-6).
 *  The accessible name is the row's own name plus what the switch does, which is the same sentence the list
 *  helper explains — so a screen-reader user hears "strip ooc runs in every chat", never a bare "switch". */
function GlobalScopeSwitch({ script, isGlobal }: { readonly script: RegexScriptRow; readonly isGlobal: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachRegexGlobal({ trpc, invalidation });
  const detach = useDetachRegexGlobal({ trpc, invalidation });

  return (
    <Switch
      aria-label={`${scriptTitle(script)} runs in every chat`}
      checked={isGlobal}
      onCheckedChange={(checked): void => {
        if (checked) {
          void attach.mutateAsync({ scriptId: script.id });
        } else {
          void detach.mutateAsync({ scriptId: script.id });
        }
      }}
    />
  );
}
