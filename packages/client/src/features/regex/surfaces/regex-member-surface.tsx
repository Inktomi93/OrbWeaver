// The regex MEMBER EDITOR — CONTENT for one selected script (config-rail-spec.md §2 C-7): the SAME
// autosave form the settings pane drove, with the SAME field set, mounted in the pane instead of stacked
// in a Dialog on top of the settings modal. The autosave status moves to the top of the pane, which is
// where the mock puts it and where a pane-shaped editor can show it without a footer.
//
// THE ONE TIER-FLAG WRITE BOUNDARY (side-eye X-1/X-2) is unchanged: `markdownOnly`/`promptOnly` are
// re-derived from the placement chips on every save, so the pair can never disagree with the chips or with
// each other — and an ST-imported row carrying contradictory flags heals the first time it is edited here.

import type { CreateRegexScriptInput, RegexScriptRow } from "@orb/contracts/regex";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Code, Icon, Trash2 } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { AutosaveStatus } from "#forms";
import { useFocusOnMount } from "#lib";
import { clearCollectionSelection } from "#state";
import { RegexEditorFields } from "../components/regex-editor-fields";
import { useRemoveRegexScript, useUpdateRegexScript } from "../hooks/use-regex-library";
import { RegexScriptForm } from "../hooks/use-regex-script-form";
import { withDerivedTierFlags } from "../lib/derive-tier-flags";
import { regexScriptTitle } from "../lib/regex-model";

/** Strip a row down to the authored fields the editor binds (id is identity, not content). */
function toFormValues(row: RegexScriptRow): CreateRegexScriptInput {
  const { id: _id, ...authored } = row;
  return authored;
}

export function RegexMemberSurface({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const row = scripts.find((script) => script.id === memberId);
  if (row === undefined) {
    // Reachable for real: another device deleted this script while it was open here (the regex verbs are
    // bus-driven, so the list refetches under the editor).
    return <EmptyState description="This script was deleted. Pick another on the left." icon={<Icon icon={Code} size="lg" />} title="Script not found" />;
  }
  return <RegexMemberEditor row={row} />;
}

function RegexMemberEditor({ row }: { readonly row: RegexScriptRow }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateRegexScript({ trpc, invalidation });
  const save = (values: CreateRegexScriptInput): Promise<unknown> => update.mutateAsync({ scriptId: row.id, input: withDerivedTierFlags(values) });

  return (
    <RegexScriptForm entityId={row.id} save={save} serverValues={toFormValues(row)}>
      {(session): ReactElement => <RegexMemberEditorBody row={row} session={session} />}
    </RegexScriptForm>
  );
}

function RegexMemberEditorBody({ row, session }: { readonly row: RegexScriptRow; readonly session: AutosaveSession<CreateRegexScriptInput> }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const remove = useRemoveRegexScript({ trpc, invalidation });
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Container>
    <Stack className="max-w-prose outline-none" data-slot="regex-member-editor" gap="block" ref={surfaceRef} tabIndex={-1}>
      <Row align="center" gap="field" justify="between">
        <Heading level={2}>
          {regexScriptTitle(row)}
        </Heading>
        <AutosaveStatus caption="Synced across your devices." onRetry={session.retrySave} state={session.saveState} />
      </Row>

      <RegexEditorFields form={session.form} />

      <Row justify="end">
        <Button intent="ghost" onClick={(): void => setDeleteOpen(true)} size="sm" type="button">
          <Icon icon={Trash2} size="sm" />
          Delete
        </Button>
      </Row>

      <ConfirmDialog
        confirmLabel="Delete"
        description="Deleting a script removes it from every preset, character, and room it is attached to. This can't be undone."
        onConfirm={(): void => {
          void remove.mutateAsync({ scriptId: row.id });
          clearCollectionSelection();
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${regexScriptTitle(row)}"?`}
      />
    </Stack>
    </Container>
  );
}
