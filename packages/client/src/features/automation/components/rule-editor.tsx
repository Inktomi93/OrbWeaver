import type { AutomationRuleCreationId, AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { createAutosaveEntityForm } from "#forms/editor";
import { useFocusOnSwap, viewerTimeZone } from "#lib";
import type { RuleCreation } from "#state";
import { useRuleAutosave } from "../hooks/use-rule-autosave.ts";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { ruleEditorCommitSchema } from "../lib/contract/rule-editor.ts";
import { ruleClockLine } from "../lib/rule-copy.ts";
import { ruleEditorDrafts } from "../lib/rule-editor-drafts.ts";
import { emptyRuleEditor, keepRowIdentities, ruleEditorValues } from "../lib/rule-editor-model.ts";
import { editableRule } from "../lib/rule-save-session.ts";
import { RuleEditorActions } from "./rule-editor-actions.tsx";
import { RuleEditorSaveStatus } from "./rule-editor-save-status.tsx";
import { RuleEditorSettings } from "./rule-editor-settings.tsx";

type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];

const RuleForm = createAutosaveEntityForm<RuleEditorValues>({
  defaultValues: emptyRuleEditor(null),
  draft: ruleEditorDrafts,
  options: { validators: { onMount: ruleEditorCommitSchema, onChange: ruleEditorCommitSchema, onSubmit: ruleEditorCommitSchema } },
});

/** The parent keeps this identity mounted through birth and list refetches. */
export function RuleEditor({
  owner,
  chatId,
  creation,
  rule,
  ruleId,
  identity,
  onClose,
}: {
  readonly owner: UserId;
  readonly chatId: ChatId | null;
  readonly creation: RuleCreation | null;
  readonly rule: Rule | null;
  readonly ruleId: AutomationRuleId | null;
  readonly identity: AutomationRuleCreationId | AutomationRuleId;
  readonly onClose: () => void;
}): ReactElement {
  const surface = useRef<HTMLDivElement>(null);
  useFocusOnSwap(surface);
  const { save, acknowledged, failure, unknownZone } = useRuleAutosave({ owner, chatId, creation, ruleId, rule });
  const [needsExistingRow] = useState(ruleId !== null);
  const [observedRow, setObservedRow] = useState(rule !== null);
  const [submitted, setSubmitted] = useState<RuleEditorValues | null>(null);
  const saveRemembered = (values: RuleEditorValues): Promise<void> => {
    setSubmitted(values);
    return save(values);
  };
  if (rule?.actionsCorrupt === true) {
    return (
      <Card ref={surface} role="region" aria-label="Rule editor" tabIndex={-1}>
        <Text>These stored actions cannot be read. Editing is unavailable; no replacement has been saved.</Text>
        <Button onClick={onClose}>Close editor</Button>
      </Card>
    );
  }
  if (rule !== null && !observedRow) {
    setObservedRow(true);
  }
  const confirmed = rule ?? (observedRow ? null : acknowledged);
  if (confirmed === null && (needsExistingRow || observedRow)) {
    return (
      <Card ref={surface} role="region" aria-label="Rule editor" tabIndex={-1}>
        <Text role="alert">This rule is no longer available. Its draft is retained, but saving cannot recreate a deleted rule.</Text>
        <Button onClick={onClose}>Close editor</Button>
      </Card>
    );
  }
  const serverValues = confirmed === null ? emptyRuleEditor(chatId) : keepRowIdentities(ruleEditorValues(editableRule(confirmed), identity), submitted);
  return (
    // Capped at the editor content column: in the full-width library pane the fields otherwise stretch past 800px.
    <Card ref={surface} role="region" aria-label="Rule editor" tabIndex={-1} className="w-full max-w-(--width-content-col)">
      <RuleForm entityId={identity} serverValues={serverValues} save={saveRemembered}>
        {(session): ReactElement => (
          <Stack gap="section">
            <Row gap="field" align="center" className="justify-between">
              <Heading level={4}>{chatId === null ? "Library-wide rule" : "Chat rule"}</Heading>
              <Button intent="ghost" onClick={onClose}>
                Close editor
              </Button>
            </Row>
            <RuleEditorSaveStatus session={session} error={failure} uncreated={confirmed === null} />
            <Text voice="gloss">Edits save automatically when complete. New rules start off; enable the rule separately when you are ready.</Text>
            <Text voice="gloss">{ruleClockLine({ stored: confirmed?.timeZone, viewerZone: viewerTimeZone(), unknownZone })}</Text>
            {rule === null || rule.rulePresetId === null ? null : (
              <Text voice="gloss">Editing makes this a custom rule and removes its rule-preset lineage.</Text>
            )}
            <RuleEditorSettings form={session.form} chatId={chatId} />
            <RuleEditorActions form={session.form} chatId={chatId} />
          </Stack>
        )}
      </RuleForm>
    </Card>
  );
}
