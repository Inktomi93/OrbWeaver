// The regex MEMBER EDITOR — CONTENT for one selected script (config-rail-spec.md §2 C-7): the SAME
// autosave form the settings pane drove, with the SAME field set, mounted in the pane instead of stacked
// in a Dialog on top of the settings modal. The autosave status moves to the top of the pane, which is
// where the mock puts it and where a pane-shaped editor can show it without a footer.
//
// THE ONE TIER-FLAG WRITE BOUNDARY (side-eye X-1/X-2) is unchanged: `markdownOnly`/`promptOnly` are
// re-derived from the placement chips on every save, so the pair can never disagree with the chips or with
// each other — and an ST-imported row carrying contradictory flags heals the first time it is edited here.
//
// DELETE IS NOT HERE — it converged onto the ROW's kebab (config-delete #271). The row kebab already carried
// Duplicate · Export · Delete, so the editor's own Delete button was a SECOND home for one verb; removing it
// leaves the one declared per-row delete affordance world-info and tags now also use. The editor is
// autosave-only; the row's kebab is where a script's lifecycle verbs live.

import type { CreateRegexScriptInput, RegexScriptRow } from "@orb/contracts/regex";
import { EmptyState } from "@orb/ui/empty-state";
import { Code, Icon } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { AutosaveStatus } from "#forms";
import { regexScriptTitle, useFocusOnMount } from "#lib";
import { RegexEditorFields } from "../components/regex-editor-fields.tsx";
import { useUpdateRegexScript } from "../hooks/use-regex-library.ts";
import { RegexScriptForm } from "../hooks/use-regex-script-form.ts";
import { withDerivedTierFlags } from "../lib/derive-tier-flags.ts";

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
    return <EmptyState description="This script was deleted. Pick another from the list." icon={<Icon icon={Code} size="lg" />} title="Script not found" />;
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Container>
      {/* `--width-content-col` — the EDITOR content-column cap, not a reading measure (#1175). See the tag
          member editor's twin: this block holds controls, so the prose token is forbidden here by its own
          contract, and `max-w-prose` was a third un-derived width. */}
      <Stack className="max-w-(--width-content-col) outline-none" data-slot="regex-member-editor" gap="block" ref={surfaceRef} tabIndex={-1}>
        <Row align="center" gap="field" justify="between">
          <Heading level={2}>{regexScriptTitle(row)}</Heading>
          <AutosaveStatus onRetry={session.retrySave} state={session.saveState} />
        </Row>

        {/* Delete lives on the ROW's kebab now (config-delete #271) — the editor is autosave-only. */}
        <RegexEditorFields form={session.form} scriptId={row.id} />
      </Stack>
    </Container>
  );
}
