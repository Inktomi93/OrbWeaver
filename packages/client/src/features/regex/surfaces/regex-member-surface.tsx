// The regex MEMBER EDITOR — CONTENT for one selected script: the SAME
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
import { Container, Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { MemberDrillBack } from "#components";
import { MemberDrillHeader } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { AutosaveStatus } from "#forms/editor";
import type { CollectionMemberView } from "#lib";
import { regexScriptTitle, useFocusOnMount } from "#lib";
import { clearCollectionSelection } from "#state";
import { RegexEditorFields } from "../components/regex-editor-fields.tsx";
import { useUpdateRegexScript } from "../hooks/use-regex-library.ts";
import { RegexScriptForm } from "../hooks/use-regex-script-form.ts";
import { withDerivedTierFlags } from "../lib/derive-tier-flags.ts";

/** Strip a row down to the authored fields the editor binds (id is identity, not content). */
function toFormValues(row: RegexScriptRow): CreateRegexScriptInput {
  const { id: _id, ...authored } = row;
  return authored;
}

export function RegexMemberSurface({ view }: { readonly view: CollectionMemberView }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const row = scripts.find((script) => script.id === view.memberId);
  const back = { label: `Back to ${view.library}`, onClick: (): void => clearCollectionSelection() };
  if (row === undefined) {
    // Reachable for real: another device deleted this script while it was open here (the regex verbs are
    // bus-driven, so the list refetches under the editor). The EXIT rides along (#1747): the drill row is
    // this surface's, so the gone-member arm owes it too or a drilled reader is stranded.
    // @orb-waive empty-state-has-action(EmptyState): the regex member editor's GONE arm — the open script was deleted on another device (the regex verbs are bus-driven, so the list refetches under the editor). The next step is picking another row in the sibling roster, which is on screen. Ends if this surface can be reached without its sibling roster.
    return (
      <Stack gap="block">
        <MemberDrillHeader back={back} />
        <EmptyState description="This script was deleted. Pick another from the list." icon={<Icon icon={Code} size="lg" />} title="Script not found" />
      </Stack>
    );
  }
  return <RegexMemberEditor back={back} row={row} />;
}

function RegexMemberEditor({ row, back }: { readonly row: RegexScriptRow; readonly back: MemberDrillBack }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateRegexScript({ trpc, invalidation });
  const save = (values: CreateRegexScriptInput): Promise<unknown> => update.mutateAsync({ scriptId: row.id, input: withDerivedTierFlags(values) });

  return (
    <RegexScriptForm entityId={row.id} save={save} serverValues={toFormValues(row)}>
      {(session): ReactElement => <RegexMemberEditorBody back={back} row={row} session={session} />}
    </RegexScriptForm>
  );
}

function RegexMemberEditorBody({
  row,
  session,
  back,
}: {
  readonly row: RegexScriptRow;
  readonly session: AutosaveSession<CreateRegexScriptInput>;
  readonly back: MemberDrillBack;
}): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Container>
      {/* `--width-content-col` — the EDITOR content-column cap, not a reading measure (#1175). See the tag
          member editor's twin: this block holds controls, so the prose token is forbidden here by its own
          contract, and `max-w-prose` was a third un-derived width. The token's stated consumption is
          THREE classes (#1664 — centered, capped, breathing to `--width-content-col-wide` past `@5xl`);
          the tag editor's twin carries the argument and the measured pane widths. */}
      <Stack
        className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide) outline-none"
        data-slot="regex-member-editor"
        gap="block"
        ref={surfaceRef}
        tabIndex={-1}
      >
        {/* THE DRILL ROW (#1747, DESIGN.md §3.4, board 05): `← Back to <library>` · the script's name · the
            member's own verbs. The autosave readout takes the trailing cluster because it is what this
            surface has there — a STATUS, and this editor's only report that a keystroke landed.
            THE BOARD'S "Test against a sample" IS NOT BUILT AS A VERB and is deliberately not invented
            here: the tester is two live PANELS at the foot of the editor (`regex-editor-fields.tsx`'s
            `RegexTestPanel` + `RegexPipelinePanel`, the REGX2 two-questions ruling), so a header button
            would be a second door onto a panel already on screen. The mock draws the button because it
            draws no panels; converging the two is a design decision this lane refuses to take silently. */}
        <MemberDrillHeader actions={<AutosaveStatus onRetry={session.retrySave} state={session.saveState} />} back={back} title={regexScriptTitle(row)} />

        {/* Delete lives on the ROW's kebab now (config-delete #271) — the editor is autosave-only. */}
        <RegexEditorFields form={session.form} scriptId={row.id} />
      </Stack>
    </Container>
  );
}
