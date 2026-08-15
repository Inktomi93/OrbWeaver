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
import { useEffect, useRef, useState } from "react";
import { BeatLine, ConfirmDialog, TrackerValue } from "#components";
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
            <Button intent="ghost" size="glyph-sm" title={`Delete entry: ${beat.title}`}>
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
  const [draft, setDraft] = useState(content);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
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
  return (
    <Collapsible
      open={open}
      onOpenChange={(next): void => {
        if (next) {
          setDraft(content);
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
          data-slot="rpg-beat-body-edit"
          id={`rpg-beat-body-${entryId}`}
          rows={4}
          value={draft}
          placeholder="write the beat…"
          onChange={(e): void => setDraft(e.target.value)}
          onBlur={(): void => {
            if (draft !== content) {
              onCommit(draft);
            }
            setOpen(false);
          }}
          onKeyDown={(e): void => {
            if (e.key === "Escape") {
              // Abandon: drop the draft, collapse, nothing sent (the TrackerValue cancel grammar).
              setDraft(content);
              setOpen(false);
            }
          }}
        />
      </CollapsiblePanel>
    </Collapsible>
  );
}
