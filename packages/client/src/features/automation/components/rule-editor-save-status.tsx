import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect } from "react";
import type { AutosaveSession, AutosaveStatusProps } from "#forms/editor";
import { AutosaveStatus } from "#forms/editor";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { ruleEditorFailure } from "../lib/rule-editor-failure.ts";

/** Presentation and field errors consume the canonical session; they never own another save driver. */
export function RuleEditorSaveStatus({
  session,
  error,
  uncreated,
}: {
  readonly session: AutosaveSession<RuleEditorValues>;
  readonly error: Error | null;
  readonly uncreated: boolean;
}): ReactElement {
  const { form, restored } = session;
  const failure = ruleEditorFailure(error);
  useEffect(() => {
    const refused = ruleEditorFailure(error);
    if (refused?.field !== undefined) {
      // A submit refusal clears through TanStack's normal valid-field change path.
      form.setFieldMeta(refused.field, (meta) => ({ ...meta, isTouched: true, errorMap: { ...meta.errorMap, onSubmit: refused.message } }));
    }
  }, [error, form]);
  return (
    <form.Subscribe selector={(state): boolean => state.isPristine}>
      {(pristine): ReactElement => (
        <Stack gap="tight">
          <AutosaveStatus
            state={uncreated && !restored && pristine ? "draft" : editorStatus(session.saveState, restored, uncreated)}
            onRetry={session.retrySave}
            retryable={failure === null || failure.retryable}
          />
          {uncreated && !restored && pristine ? <Text voice="gloss">Name the rule and add an action.</Text> : null}
          {session.saveState === "blocked" && (!pristine || restored) ? (
            <Button intent="ghost" className="justify-start" onClick={session.retrySave}>
              Review fields
            </Button>
          ) : null}
          {failure === null ? null : (
            <Text role="alert" voice="reading" className="text-destructive">
              {failure.message}
            </Text>
          )}
        </Stack>
      )}
    </form.Subscribe>
  );
}

function editorStatus(state: AutosaveStatusProps["state"], restored: boolean, uncreated: boolean): AutosaveStatusProps["state"] {
  if (state !== "saved") {
    return state;
  }
  if (restored) {
    return "restored";
  }
  return uncreated ? "draft" : "saved";
}
