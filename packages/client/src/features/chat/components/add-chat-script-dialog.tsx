// "Attach a script" — the room's own regex tier's PICKER (host only), in the lorebook-attach grammar
// (the `THIS CHAT` extras; the canvas's phone board p2 draws
// it as a sheet with a filter, checkboxes and one primary).
//
// WHY NOT `RegexScriptPicker`, which already exists and already has a chat arm: it mounts a SECOND run-order
// editor and a per-row attach SWITCH over the same junction this section is already showing and ordering.
// Two live order editors and two attach controls for one room, one screen apart, is the doubling every rack
// in this pane exists to avoid — so the room's picker is a one-shot DIALOG (pick, attach, close) and the
// order stays where the rows are. The shared picker keeps its three other homes (preset / character, and the
// character facet) untouched.
//
// MULTI-SELECT, unlike `AddChatBookDialog`'s attach-on-click: attaching N scripts is the normal gesture here
// (a debugging setup is a SET of rules), and each attach is an independent idempotent write, so the dialog
// commits them together and closes once. A row already attached is shown and marked rather than subtracted:
// "this one is already here" is the answer to the question the host is asking, where a silently missing row
// reads as a library that lost it.

import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { DialogClose } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Code, Icon, Search } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog } from "#components";
import { SkeletonRows, useInvalidation, useTRPC } from "#data";
import { regexScriptScent, regexScriptTitle, timeLib } from "#lib";
import { useAttachScriptToChat } from "../hooks/use-chat-regex-mutations.ts";

/** The candidate list's shape-matched loading skeleton (house loading law — never a spinner/text void). */
const PICKER_SKELETON_ROWS = 3;

export interface AddChatScriptDialogProps {
  readonly chatId: ChatId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The script ids this room's own tier already holds — the "already attached" mark. Passed IN rather than
   *  re-read so the dialog and the rack behind it are computed from ONE snapshot of the room. */
  readonly attachedIds: readonly RegexScriptId[];
}

export function AddChatScriptDialog({ chatId, open, onOpenChange, attachedIds }: AddChatScriptDialogProps): ReactElement {
  return (
    <FormDialog
      description="Its rules run on this room's prompts, in the order the section shows — and only here. A script stays in your library; detaching it from this chat leaves every other chat alone."
      onOpenChange={onOpenChange}
      open={open}
      title="Attach a script to this chat"
    >
      {/* Non-suspending: the dialog frame paints at once and the candidate list fills in, so opening the
          picker never blanks the panel behind it through a shared suspense boundary. */}
      <PickerBody attachedIds={attachedIds} chatId={chatId} onClose={(): void => onOpenChange(false)} />
    </FormDialog>
  );
}

function PickerBody({
  attachedIds,
  chatId,
  onClose,
}: {
  readonly attachedIds: readonly RegexScriptId[];
  readonly chatId: ChatId;
  readonly onClose: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachScriptToChat({ trpc, invalidation });
  const library = useQuery(trpc.regex.listScripts.queryOptions());
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<readonly RegexScriptId[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  if (library.isPending) {
    return <SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />;
  }

  const scripts = library.data ?? [];
  if (scripts.length === 0) {
    return (
      <EmptyState
        // The only next action REACHABLE from inside a modal is leaving it — the library lives behind the
        // rail, which this dialog is covering. Naming that honestly beats a CTA that cannot fire.
        action={<DialogClose render={<Button intent="secondary">Close</Button>} />}
        description="Write one in your script library — a find/replace rule with the streams it runs on — and it can run in this room."
        icon={<Icon icon={Code} size="lg" />}
        title="You have no regex scripts yet"
      />
    );
  }

  const needle = filter.trim().toLowerCase();
  const matches = needle === "" ? scripts : scripts.filter((script) => regexScriptTitle(script).toLowerCase().includes(needle));

  const commit = async (): Promise<void> => {
    setFailure(null);
    try {
      // Sequential rather than parallel: each attach appends to the SAME junction, and the room's run order
      // is the append order — a parallel fan-out would land the picks in whatever order the server finished
      // them, which is not the order the host ticked them.
      for (const scriptId of picked) {
        await attach.mutateAsync({ chatId, scriptId });
      }
      setPicked([]);
      onClose();
    } catch {
      setFailure("Couldn't attach those scripts to this chat.");
    }
  };

  return (
    <Stack gap="field">
      <Row align="center" gap="tight">
        <Icon className="text-muted-foreground" icon={Search} size="sm" />
        <Input aria-label="Filter your scripts" onValueChange={setFilter} placeholder="Filter your scripts…" value={filter} />
      </Row>
      {matches.length === 0 ? (
        <Text aria-live="polite" role="status" voice="gloss">
          No scripts match that filter.
        </Text>
      ) : null}
      <Stack gap="tight">
        {matches.map((script) => {
          const already = attachedIds.includes(script.id);
          const name = regexScriptTitle(script);
          return (
            <ListRow
              // THE CHECKBOX RIDES `actions`, NOT `leading`, and that is not cosmetic: `ListRow`'s leading
              // slot is `aria-hidden` (it is the decorative avatar/glyph column, `list-row/parts.tsx`), so a
              // control placed there is out of the accessibility tree entirely — invisible to a screen
              // reader and an `aria-hidden-focus` violation the moment it takes focus. The canvas draws the
              // tick at the left of the sheet row; the trailing slot is where an interactive control is
              // allowed to live in this primitive.
              actions={
                <Checkbox
                  aria-label={already ? `${name} — already attached to this chat` : `Attach ${name} to this chat`}
                  checked={already || picked.includes(script.id)}
                  disabled={already}
                  onCheckedChange={(next): void => {
                    setPicked((current) => (next === true ? [...current, script.id] : current.filter((id) => id !== script.id)));
                  }}
                  tone="quiet"
                />
              }
              key={script.id}
              subtitle={already ? "already attached to this chat" : regexScriptScent(script, timeLib.formatRelative)}
              title={name}
            />
          );
        })}
      </Stack>
      {failure === null ? null : (
        <Text className="text-destructive" role="alert" voice="label">
          {failure}
        </Text>
      )}
      <Row gap="field" justify="end">
        <DialogClose render={<Button intent="ghost">Cancel</Button>} />
        <Button disabled={picked.length === 0 || attach.isPending} intent="primary" onClick={(): void => void commit()} type="button">
          Attach to this chat
        </Button>
      </Row>
    </Stack>
  );
}
