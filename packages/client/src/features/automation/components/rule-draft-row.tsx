import type { UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useIsMutating } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { useTRPC } from "#data";
import { notify } from "#lib";
import type { RuleCreation } from "#state";
import { ruleEditorDraftSchema } from "../lib/contract/rule-editor.ts";
import { discardRuleDraft, ruleEditorDrafts } from "../lib/rule-editor-drafts.ts";

/** Only closed drafts can be discarded; a pending write must finish before its mirror can be removed. */
export function RuleDraftRow({
  creation,
  owner,
  ordinal,
  onResume,
}: {
  readonly creation: RuleCreation;
  readonly owner: UserId;
  readonly ordinal: number;
  readonly onResume: (trigger: HTMLButtonElement) => void;
}): ReactElement | null {
  const trpc = useTRPC();
  const pendingCreate = useIsMutating({ mutationKey: trpc.automation.createRule.mutationKey() });
  const pendingUpdate = useIsMutating({ mutationKey: trpc.automation.updateRule.mutationKey() });
  const reasonId = useId();
  const draft = ruleEditorDrafts.useDraft(creation.requestId);
  const present = ruleEditorDrafts.useHasDraft(creation.requestId);
  const validated = ruleEditorDraftSchema.safeParse(draft).data;
  if (!present || validated === undefined) {
    return null;
  }
  const title = validated.name.trim() || `Untitled rule ${ordinal}`;
  const pending = pendingCreate + pendingUpdate > 0;
  return (
    <Stack gap="tight">
      <Text voice="gloss">Unfinished rule {ordinal}</Text>
      <Row gap="field">
        <Button intent="secondary" size="wrap" className="min-w-0 flex-1 justify-start" onClick={(event): void => onResume(event.currentTarget)}>
          Resume {title}
        </Button>
        <Button
          intent="ghost"
          size="sm"
          aria-label={`Discard ${title}`}
          disabled={pending}
          aria-describedby={pending ? reasonId : undefined}
          onClick={(): void => {
            const undo = discardRuleDraft(creation.requestId, owner);
            if (undo !== undefined) {
              notify.info({
                title: `Discarded ${title}`,
                description: "Only the local draft was removed. Any saved rule is unchanged.",
                action: {
                  label: "Undo",
                  onClick: (): void => {
                    if (!undo()) {
                      notify.info("This draft cannot replace newer work or a different account's drafts.");
                    }
                  },
                },
              });
            }
          }}
        >
          Discard
        </Button>
      </Row>
      {pending ? (
        <Text id={reasonId} voice="gloss">
          Wait for the pending save before discarding a draft.
        </Text>
      ) : null}
    </Stack>
  );
}
