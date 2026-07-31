// The shared VALUE affordance for the tracker block kit (Context-Panel-Program §3.2; panel-redesign
// DESIGN.md §12.4.1). Editable-in-place is the LAW, not an option — but the panel is an INSTRUMENT, not a
// form: an editable value renders as STATIC display AT REST (indistinguishable from the read-only arm) and
// reveals its inline input only on click/focus (the §12.4.1 "click the value → inline input → Enter/blur
// commits" grammar). The read-only arm (no `onEdit`) is the honest-arms fallback (a non-editor viewer),
// never a silent degrade. The value TEXT is always the datum (§4.9): the rest state is a real <button>
// CARRYING that text (keyboard-reachable, focus-ringed), the edit state an input pre-filled with it.
// Escape cancels the draft; Enter/blur commits. A passive re-render never clobbers an open draft
// (§12.4.4 — the draft is seeded ONCE, when the editor opens).
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
  /** Text tone for the at-rest/read-only display (foreground by default; muted for secondary). */
  readonly tone?: ComponentProps<typeof Text>["tone"];
  /** Text size of the at-rest/read-only display — "label" default; StatCell's big value passes "title". */
  readonly size?: ComponentProps<typeof Text>["size"];
  /** Shown (muted) in the REST state when the value is empty, and as the input's placeholder — so an
   *  empty-but-editable field reads as intentionally-blank, not unfinished (§3.2). */
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
}

/** The value cell: static display at rest; click reveals the inline editor (when `onEdit` is set). */
export function TrackerValue({
  display,
  editValue,
  onEdit,
  kind = "text",
  ariaLabel,
  tone = "default",
  size = "label",
  placeholder,
  className,
  restClassName,
  editTitle = "Click to edit",
}: TrackerValueProps): ReactElement {
  const source = editValue ?? display;
  const [editing, setEditing] = useState(false);
  // The draft is seeded when the editor OPENS (never reset by a passive re-render — §12.4.4: an external
  // change mid-edit must not clobber the open draft; the feature-level swipe ward owns that conflict).
  const [draft, setDraft] = useState(source);

  if (onEdit === undefined) {
    return (
      <Text as="span" size={size} tone={tone} className={className}>
        {display}
      </Text>
    );
  }

  if (!editing) {
    const empty = display === "";
    const restText = empty ? (placeholder ?? "—") : display;
    return (
      <Button
        type="button"
        intent="ghost"
        size="sm"
        data-slot="tracker-value-rest"
        aria-label={ariaLabel}
        title={editTitle}
        onClick={(): void => {
          setDraft(source);
          setEditing(true);
        }}
        // Text-height at rest (the display-at-rest posture): the button hugs its datum text; a caller's
        // width/alignment classes still apply so the rest state lines up with the read-only arm. The
        // TRANSPARENT border reserves the edit input's 1px border box, so the click-to-reveal swap is
        // pixel-stable — no layout jump (the owner no-shift bar).
        className={`!h-auto min-h-0 justify-start gap-0 border border-transparent !px-field !py-0 text-left font-normal ${restClassName ?? className ?? ""}`}
      >
        <Text as="span" size={size} tone={empty ? "muted" : tone} className="truncate">
          {restText}
        </Text>
      </Button>
    );
  }

  const commit = (): void => {
    if (draft !== source) {
      onEdit(draft);
    }
    setEditing(false);
  };

  return (
    <Input
      // The input exists ONLY after an explicit click on the rest value (§12.4.1 click-to-edit) — moving
      // focus into it is the expected continuation of that gesture, not a focus steal.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={true}
      aria-label={ariaLabel}
      // COMPACT in-place editor (owner bar: the revealed input occupies the SAME visual slot the display
      // did — no clip, no overflow, no layout jump): text-height box (`!h-auto py-0`), the rest state's
      // `px-field` inset, and the display's `text-label` type — over the Input primitive's form-field
      // skin (h-control-sm/px-block/text-body would grow the row on reveal). Callers append width/
      // alignment only, never a height.
      className={`!h-auto min-h-0 !px-field py-0 text-label leading-label ${className ?? ""}`}
      data-slot="tracker-value-edit"
      inputMode={kind === "numeric" ? "numeric" : "text"}
      {...(placeholder === undefined ? {} : { placeholder })}
      onBlur={commit}
      onKeyDown={(e): void => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          // Cancel: drop the draft, back to rest, nothing sent.
          setDraft(source);
          setEditing(false);
        }
      }}
      onValueChange={setDraft}
      value={draft}
    />
  );
}
