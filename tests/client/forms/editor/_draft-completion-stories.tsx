import { hashServerBaseline } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms/editor";
import { createEntityDraftStore } from "@orb/client/state";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { z } from "zod";

const draftSchema = z.object({ text: z.string() });
type Values = z.infer<typeof draftSchema>;
const committedSchema = draftSchema.extend({ text: z.string().min(2) });
const entityId = "draft-completion";
const drafts = createEntityDraftStore<Values>({
  name: "ct-unsubmitted-completion",
  schemaVersion: 1,
  validate: (value) => {
    const parsed = draftSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  },
});
const Boundary = createAutosaveEntityForm<Values>({
  defaultValues: { text: "" },
  draft: drafts,
  debounceMs: 60_000,
  options: { validators: { onMount: committedSchema, onChange: committedSchema, onSubmit: committedSchema } },
});

export function UnsubmittedDraftCompletionStory({ restored = false }: { readonly restored?: boolean }): ReactElement {
  const pending = useRef<PromiseWithResolvers<void> | null>(null);
  const [server, setServer] = useState<Values>({ text: "server" });
  const [mounted, setMounted] = useState(() => {
    if (restored) {
      drafts.setDraft(entityId, { text: "restored B" }, hashServerBaseline({ text: "server" }));
    }
    return true;
  });
  const [calls, setCalls] = useState(0);
  const draft = drafts.useDraft(entityId);
  const save = async (values: Values): Promise<void> => {
    const operation = Promise.withResolvers<void>();
    pending.current = operation;
    setCalls((count) => count + 1);
    await operation.promise;
    setServer(values);
  };
  return (
    <div>
      {mounted ? (
        <Boundary entityId={entityId} serverValues={server} save={save}>
          {(session): ReactElement => (
            <div>
              <session.form.AppField name="text">{(field): ReactElement => <field.TextField label="Pending text" />}</session.form.AppField>
              <button type="button" onClick={session.retrySave}>
                Submit snapshot
              </button>
              <output data-testid="draft-save-state">{session.saveState}</output>
            </div>
          )}
        </Boundary>
      ) : null}
      <button type="button" onClick={(): void => pending.current?.resolve()}>
        Resolve save
      </button>
      <button type="button" onClick={(): void => setMounted((value) => !value)}>
        {mounted ? "Close editor" : "Reopen editor"}
      </button>
      <button type="button" onClick={(): void => setServer({ text: "external C" })}>
        Receive external change
      </button>
      <output data-testid="draft-live-value">{draft.text ?? "no draft"}</output>
      <output data-testid="draft-save-count">{calls}</output>
      <output data-testid="draft-server-value">{server.text}</output>
    </div>
  );
}
