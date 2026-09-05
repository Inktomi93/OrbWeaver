// The shared VALUE affordance for the tracker block kit. Editable-in-place is the LAW, not an option — but the panel is an INSTRUMENT, not a
// form: an editable value renders as STATIC display AT REST (indistinguishable from the read-only arm) and
// reveals its inline input only on click/focus (the "click the value → inline input → Enter/blur
// commits" grammar). The read-only arm (no `onEdit`) is the honest-arms fallback (a non-editor viewer),
// never a silent degrade. The value TEXT is always the datum: the rest state is a real <button>
// CARRYING that text (keyboard-reachable, focus-ringed), the edit state an input pre-filled with it.
// Escape cancels the draft; Enter/blur commits. A passive re-render never clobbers an open draft
// (the draft is seeded ONCE, when the editor opens).
//
// AND THE COMMIT IS JUDGED AGAINST THE VALUE AT OPEN TIME, NEVER THE CURRENT ONE (#1485). Those two
// sentences are the same ruling read from both ends: because an external change mid-edit deliberately does
// NOT reseed the draft, the draft and the live value can disagree for a reason that is not "the user typed
// something" — and a `draft !== current` guard reads that disagreement as an edit and writes the value the
// user opened with back over the one that arrived. That is the stale-writer bug in its purest form: the
// comparison meant to SUPPRESS a pointless write is exactly what performs a destructive one. An open editor
// therefore remembers what it opened with, and the three cases are distinct:
//   • the draft still equals what it opened with → the user changed nothing, so NOTHING is sent, however
//     far the world has moved underneath;
//   • the user edited and the value did not move → an ordinary commit;
//   • the user edited AND the value moved → a real CONFLICT between two writers, which is surfaced
//     (`data-conflict`, the invalid skin, a title naming the incoming value) instead of silently resolved.
//     Confirming again overwrites deliberately; Escape takes the incoming value. Reseeding the draft was
//     the other arm and is refused: it destroys keystrokes the user can still see.
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";
import { useState } from "react";

export interface TrackerValueProps {
  /** The current value, pre-formatted by the block (e.g. "24/30", "wary", "16"). */
  readonly display: string;
  /** The raw editable string (what seeds the input); defaults to `display`. */
  readonly editValue?: string;
  /** Commit handler — absent ⇒ READ-ONLY (the honest-arms arm). Present ⇒ display-at-rest, input on click. */
  readonly onEdit?: (next: string) => void;
  /** The input's semantic type — "text" | "numeric" drives inputMode/keyboard. @defaultValue "text" */
  readonly kind?: "text" | "numeric";
  /** Accessible name for the value (rest button + edit field — the tracker's label, "Vitality value"). */
  readonly ariaLabel: string;
  /** Accessible name for the at-rest button when it must include the displayed datum. The edit field keeps
   *  `ariaLabel`, so automation has a stable field name after opening the value. */
  readonly restAriaLabel?: string;
  /** Text tone for the at-rest/read-only display (foreground by default; muted for secondary). */
  readonly tone?: ComponentProps<typeof Text>["tone"];
  /** Text size of the at-rest/read-only display — "label" default; StatCell's big value passes "title". */
  readonly size?: ComponentProps<typeof Text>["size"];
  /** Shown (muted) in the REST state when the value is empty, and as the input's placeholder — so an
   *  empty-but-editable field reads as intentionally-blank, not unfinished. */
  readonly placeholder?: string;
  /** Sizing/alignment for the EDIT input (and, absent `restClassName`, the rest button too). */
  readonly className?: string;
  /** Rest-button override — when the input needs a fixed width (`!w-avatar-lg` numerics) the rest state
   *  should still hug its text like the read-only arm; pass the rest-specific classes here. */
  readonly restClassName?: string;
  /** The rest button's `title` — what this edit actually WRITES, when "Click to edit" understates it. The
   *  founding consumer is a meter's MAX on a roster card: the max lives on the tracker DEF, so editing it
   *  from one actor's row changes the ceiling for everyone who carries that tracker (the unification's one
   *  max home). An edit with game-wide reach says so before it's made. @defaultValue "Click to edit" */
  readonly editTitle?: string;
  /** Rest-state overflow: MODEL-AUTHORED free text (mood, status) must WRAP — the writer is a model with
   *  no length contract, and a truncated datum hides the datum (the text IS the value). Numerics and
   *  host-named values keep the default single-line truncate (their width is layout-owned). @defaultValue false */
  readonly wrap?: boolean;
}

/** One OPEN edit — the three facts that only mean anything together (see the header's commit ruling). */
interface EditSession {
  /** What the field currently holds. Seeded from the value at open; only the user's typing moves it. */
  readonly draft: string;
  /** The value the draft was seeded FROM. The commit is judged against THIS, never against the live one. */
  readonly openedFrom: string;
  /** The value that arrived underneath this edit, once a commit has found one. `null` = uncontested. */
  readonly conflict: string | null;
}

/**
 * What a commit does — as a pure decision, so the three cases read as three cases (#1485).
 * `send: null` means nothing goes to `onEdit`; `next: null` means the editor closes.
 */
function resolveCommit(session: EditSession, source: string): { readonly send: string | null; readonly next: EditSession | null } {
  if (session.draft === session.openedFrom) {
    return { send: null, next: null }; // nothing typed — never write, however far the value has moved
  }
  if (source !== session.openedFrom && session.conflict === null) {
    return { send: null, next: { ...session, conflict: source } }; // two writers — surface it, hold the edit
  }
  return { send: session.draft, next: null }; // an ordinary commit, or a deliberate overwrite of a conflict
}

/** The REST state of an editable value — a real button CARRYING the datum text (see the header). Split out
 *  of `TrackerValue` so the editor arm's commit ruling is the only thing that file-reads as branching. */
function TrackerValueRest({
  ariaLabel,
  className,
  display,
  editTitle,
  onOpen,
  placeholder,
  size,
  tone,
  wrap,
}: {
  readonly ariaLabel: string;
  readonly className: string;
  readonly display: string;
  readonly editTitle: string;
  readonly onOpen: () => void;
  readonly placeholder: string | undefined;
  readonly size: ComponentProps<typeof Text>["size"];
  readonly tone: ComponentProps<typeof Text>["tone"];
  readonly wrap: boolean;
}): ReactElement {
  const empty = display === "";
  const restText = empty ? (placeholder ?? "—") : display;
  return (
    <Button
      type="button"
      intent="ghost"
      size="inline"
      data-slot="tracker-value-rest"
      aria-label={ariaLabel}
      title={editTitle}
      onClick={onOpen}
      // Text-height at rest (the display-at-rest posture): the button hugs its datum text; a caller's
      // width/alignment classes still apply so the rest state lines up with the read-only arm. The
      // TRANSPARENT border reserves the edit input's 1px border box, so the click-to-reveal swap is
      // pixel-stable — no layout jump (the owner no-shift bar).
      className={`gap-0 border border-transparent px-field text-left ${className}`}
    >
      <Text as="span" size={size} tone={empty ? "muted" : tone} className={wrap ? "min-w-0 whitespace-normal break-words" : "truncate"}>
        {restText}
      </Text>
    </Button>
  );
}

/** The value cell: static display at rest; click reveals the inline editor (when `onEdit` is set). */
export function TrackerValue({
  display,
  editValue,
  onEdit,
  kind = "text",
  ariaLabel,
  restAriaLabel,
  tone = "default",
  size = "label",
  placeholder,
  className,
  restClassName,
  editTitle = "Click to edit",
  wrap = false,
}: TrackerValueProps): ReactElement {
  const source = editValue ?? display;
  // ONE state, because the three fields are only ever meaningful together: the draft is seeded when the
  // editor OPENS, `openedFrom` freezes the value it was seeded FROM (what the commit is judged against),
  // and `conflict` holds the value that arrived underneath an edit-in-progress. `null` IS the rest state —
  // a passive re-render can reach none of them, which is what makes the no-clobber rule structural.
  const [session, setSession] = useState<EditSession | null>(null);

  if (onEdit === undefined) {
    return (
      <Text as="span" size={size} tone={tone} className={className}>
        {display}
      </Text>
    );
  }

  if (session === null) {
    return (
      <TrackerValueRest
        ariaLabel={restAriaLabel ?? ariaLabel}
        className={restClassName ?? className ?? ""}
        display={display}
        editTitle={editTitle}
        onOpen={(): void => {
          setSession({ draft: source, openedFrom: source, conflict: null });
        }}
        placeholder={placeholder}
        size={size}
        tone={tone}
        wrap={wrap}
      />
    );
  }

  const { draft, openedFrom, conflict } = session;
  const contested = conflict !== null;

  const commit = (): void => {
    const { send, next } = resolveCommit(session, source);
    if (send !== null) {
      onEdit(send);
    }
    setSession(next);
  };

  return (
    <Input
      // The input exists ONLY after an explicit click on the rest value (click-to-edit) — moving
      // focus into it is the expected continuation of that gesture, not a focus steal.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={true}
      aria-label={ariaLabel}
      // COMPACT in-place editor (owner bar: the revealed input occupies the SAME visual slot the display
      // did — no clip, no overflow, no layout jump): the `inline` layout arm IS that box — text-height,
      // the rest state's `px-field` inset, the display's `text-label` type — where the default `field` arm
      // (h-control-sm/px-block/text-body) would grow the row on reveal. Callers append width/alignment
      // only, never a height.
      layout="inline"
      className={className ?? ""}
      data-slot="tracker-value-edit"
      // The CONFLICT surface. `data-conflict` carries the value that arrived (an automatable fact, and the
      // one a reader needs), `data-invalid` lights the primitive's own destructive border — the skin the
      // input already ships for "this is not going to land as typed" — and the title says what happened and
      // what each key now does. No extra element: the editor must keep occupying the display's slot (the
      // owner no-shift bar), so the signal rides the control that is already there.
      {...(contested ? { "data-conflict": conflict, "data-invalid": "" } : {})}
      title={contested ? `Changed to "${conflict}" while you were editing — commit again to overwrite it, Escape to keep it.` : undefined}
      inputMode={kind === "numeric" ? "numeric" : "text"}
      {...(placeholder === undefined ? {} : { placeholder })}
      onBlur={commit}
      onKeyDown={(e): void => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          // Cancel: drop the draft, back to rest, nothing sent — and under a conflict that is the "keep
          // what arrived" answer, since the rest state renders the CURRENT value.
          setSession(null);
        }
      }}
      onValueChange={(next): void => {
        setSession({ draft: next, openedFrom, conflict });
      }}
      value={draft}
    />
  );
}
