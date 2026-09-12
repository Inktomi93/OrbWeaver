// One CHRONICLE BEAT — the journal tab's row family, split out of `rpg-journal-tab.tsx` (the component-size
// cap; the tab keeps the scopes/grouping composition, this keeps the row anatomy).
//
// A beat renders as a BULLET LINE (bordered cards are reserved for ARTIFACTS): the type word, the title,
// then the body in the same muted voice. A member reads static text (PERMISSION-omit, never a disabled
// control). For a HOST the title is click-to-edit in place and the BODY expands in place into a
// real multi-line editor — owner dogfood 2026-07-31 ("clicking on a journal entry should expand an editor
// like injections does and overrides, right now it just does a single line and its very hard to see"): a
// journal body is a paragraph the model wrote, and a one-line input showed it through a letterbox. The
// anatomy is the room-overrides collapse card (`chat/components/room-overrides-form.tsx`) — compact row at
// rest, click expands the editor in the row's own place — and so is its save grammar: the panel AUTOSAVES
// (D66 A4 — there are no Save/Discard buttons in this product), so the editor commits on blur and Escape
// abandons the draft.

import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { BeatLine, ConfirmDialog, TrackerValue } from "#components";
import type { EditSession } from "#lib";
import { resolveCommit } from "#lib";
import { journalRowLabel } from "../lib/journal-labels.ts";

/** The host's per-beat write callbacks (absent ⇒ the read-only member arm — PERMISSION-omit). */
export interface BeatEdit {
  readonly onEditTitle: (entryId: string, next: string) => void;
  readonly onEditContent: (entryId: string, next: string) => void;
  readonly onDelete: (entryId: string) => void;
}

export interface BeatRowProps {
  /** The stored entry projected onto the row (`key` = the entry id — the edit/delete verbs' address). */
  readonly beat: {
    readonly key: string;
    readonly type: string;
    readonly label: string;
    readonly title: string;
    readonly content: string;
  };
  readonly edit?: BeatEdit;
}

/** One plain BEAT — a bullet line: the type label, the title, then the body. The em-dash marker is
 *  BeatLine's own. Host ⇒ inline title + the expanding body editor + a confirmed delete. */
export function BeatRow({ beat, edit }: BeatRowProps): ReactElement {
  const typeLabel = (
    <Text as="span" voice="gloss" className="shrink-0 uppercase">
      {journalRowLabel(beat.type, beat.label)}
    </Text>
  );
  if (edit === undefined) {
    return (
      <BeatLine>
        {typeLabel}{" "}
        <Text as="span" voice="label">
          {beat.title}
        </Text>
        {beat.content === "" ? null : (
          <Text as="span" voice="gloss">
            {` — ${beat.content}`}
          </Text>
        )}
      </BeatLine>
    );
  }
  return (
    <BeatBodyEditor
      entryId={beat.key}
      title={beat.title}
      content={beat.content}
      onCommit={(next): void => edit.onEditContent(beat.key, next)}
      lead={
        <>
          {typeLabel}
          <TrackerValue
            ariaLabel={`${beat.title} title`}
            display={beat.title}
            wrap={true}
            className="min-w-0 max-w-full"
            onEdit={(next): void => edit.onEditTitle(beat.key, next)}
          />
        </>
      }
      trailing={
        <ConfirmDialog
          title={`Delete "${beat.title}"?`}
          description="The entry leaves the chronicle for good. Nothing else in the game state changes."
          confirmLabel="Delete"
          onConfirm={(): void => edit.onDelete(beat.key)}
          trigger={
            <Button aria-label={`Delete entry: ${beat.title}`} intent="ghost" size="glyph-sm" title={`Delete entry: ${beat.title}`}>
              <Icon icon={Trash2} size="xs" />
            </Button>
          }
        />
      }
    />
  );
}

/** The host's BEAT body editor — the row at rest, its muted body line as the expand trigger, and the
 *  multi-line editor taking that line's place while open. The draft is seeded ONCE when the editor opens
 *  (a passive re-render never clobbers what the host is typing). */
function BeatBodyEditor({
  entryId,
  title,
  content,
  onCommit,
  lead,
  trailing,
}: {
  readonly entryId: string;
  readonly title: string;
  readonly content: string;
  readonly onCommit: (next: string) => void;
  readonly lead: ReactNode;
  readonly trailing: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  /**
   * THE OPEN EDIT — draft, what it opened with, and what arrived underneath it (`lib/edit-session.ts`).
   *
   * The draft is seeded ONCE, when the editor opens: a passive re-render must not clobber what the host is
   * typing, and that ruling is preserved by changing the commit's CONDITION rather than the seeding
   * (#1502). Judging against `openedFrom` is what stopped an untouched editor writing its opened-with text
   * back over a body that changed underneath it.
   *
   * AND THE COLLISION IS NOW SURFACED RATHER THAN RESOLVED FOR THE HOST (#1559). When the host HAS typed
   * and the body ALSO moved — the normal case during play, because beats are model-writable — this row
   * used to take the host's text silently, where `TrackerValue` holds and asks. Both editors now go
   * through the ONE resolver: nothing typed ⇒ nothing sent; typed over a still body ⇒ an ordinary commit;
   * both moved ⇒ held open with what arrived stated, where committing again overwrites deliberately and
   * Escape keeps what arrived. Reseeding the draft stays the refused arm.
   */
  const [session, setSession] = useState<EditSession>({ draft: content, openedFrom: content, conflict: null });
  /**
   * IS THIS CLOSE A CANCELLATION? (#1502.) The commit runs on BLUR and collapsing the panel is what
   * produces that blur, so the two things Escape must do (drop the draft, collapse) reach `onBlur` as one
   * already-decided fact it cannot infer: a `setSession` does not take effect before the unmount-driven
   * blur runs, and that handler is closed over the PREVIOUS render's session, so Escape used to commit the
   * very text it had just been asked to throw away. A ref, not state, precisely because it must be
   * readable inside that already-scheduled handler.
   */
  const cancelled = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const conflictId = useId();
  // The editor exists only after an explicit click on the beat's body (the click-to-edit gesture) —
  // and the panel is unmounted while closed, so mounting IS opening. Taking focus is that gesture's
  // continuation, not a focus steal (and it keeps the keyboard path whole: the trigger it replaced is gone).
  useEffect(() => {
    if (open) {
      bodyRef.current?.focus();
    }
  }, [open]);
  const bodyLabel = `${title} entry`;
  // An unwritten body still says something (empty states are load-bearing): the rest line is the invitation.
  const restText = content === "" ? "write the beat…" : content;
  // @orb-waive sub-floor-disclosure("text"): the box is the rendered Button's own (`render` MERGES the trigger class onto it) — an inline Button carries its ::after touch floor, and a control min-h here would inflate the beat row's compact rest state. Placed on the return statement: the trigger sits inside `{open ? null : (…)}` between two authored siblings, and the central engine judges any marker inside such an expression ambiguous, so the enclosing statement is the nearest carrier that binds.
  return (
    <Collapsible
      open={open}
      onOpenChange={(next): void => {
        if (next) {
          setSession({ draft: content, openedFrom: content, conflict: null });
          cancelled.current = false;
        }
        setOpen(next);
      }}
      data-slot="rpg-beat-row"
    >
      <BeatLine>
        {lead}
        {/* The body AT REST — the same muted voice the read-only arm prints, as the expand trigger. While
            the editor is OPEN the rest line is gone: the editor takes the body's place (expand IN PLACE),
            never sits under a copy of itself. */}
        {open ? null : (
          <CollapsibleTrigger
            chevron={false}
            size="text"
            render={
              <Button intent="ghost" size="inline" className="min-w-0 max-w-full whitespace-normal px-field text-left">
                <Text as="span" voice="label" className="min-w-0 break-words">
                  {restText}
                </Text>
              </Button>
            }
            aria-label={bodyLabel}
            title="Click to edit the beat"
          />
        )}
        {trailing}
      </BeatLine>
      <CollapsiblePanel>
        <Textarea
          ref={bodyRef}
          aria-label={bodyLabel}
          {...(session.conflict === null ? {} : { "aria-describedby": conflictId })}
          data-slot="rpg-beat-body-edit"
          // The CONFLICT surface, in `tracker-value.tsx`'s own vocabulary: `data-conflict` carries THE VALUE
          // that arrived (one spelling for both editors, so a sweep finds both), and `data-invalid` lights
          // the primitive's destructive border — the skin it already ships for "this is not going to land as
          // typed". What differs is where the incoming value is READ: a beat body is a PARAGRAPH, so it is
          // shown in the line below rather than quoted into a `title` the way a short datum can be. The
          // panel is already expanded, so there is room — and a rewrite you cannot read is not a choice you
          // can make.
          {...(session.conflict === null ? {} : { "data-conflict": session.conflict, "data-invalid": "" })}
          id={`rpg-beat-body-${entryId}`}
          rows={4}
          value={session.draft}
          placeholder="write the beat…"
          onChange={(e): void => setSession({ ...session, draft: e.target.value })}
          onBlur={(): void => {
            const abandoned = cancelled.current;
            cancelled.current = false;
            if (abandoned) {
              // Nothing sent when the host abandoned the edit — see the `cancelled` note above for why
              // this is not inferable here.
              setOpen(false);
              return;
            }
            const { send, next } = resolveCommit(session, content);
            if (send !== null) {
              onCommit(send);
            }
            // `next` non-null is the HELD conflict: the editor stays open carrying the host's text, and the
            // second commit through here is the deliberate overwrite.
            if (next === null) {
              setOpen(false);
            } else {
              setSession(next);
            }
          }}
          onKeyDown={(e): void => {
            if (e.key === "Escape") {
              // Abandon: mark the cancellation FIRST (the collapse below produces the blur that would
              // otherwise commit), drop the draft, collapse, nothing sent (the TrackerValue cancel
              // grammar). Under a conflict this is also the "keep what arrived" answer, since the row at
              // rest renders the CURRENT body.
              cancelled.current = true;
              setSession({ draft: content, openedFrom: content, conflict: null });
              setOpen(false);
            }
          }}
        />
        {session.conflict === null ? null : (
          <Text data-slot="rpg-beat-body-conflict" id={conflictId} voice="label">
            {`The beat changed while you were editing — save again to overwrite it, or press Escape to keep what arrived: “${session.conflict}”`}
          </Text>
        )}
      </CollapsiblePanel>
    </Collapsible>
  );
}
