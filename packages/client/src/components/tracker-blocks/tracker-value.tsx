// The shared VALUE affordance for the tracker block kit (Context-Panel-Program §3.2). Editable-in-place
// is the LAW, not an option: a display-only tracker is the named corruption-trainer failure ("lite died
// last time because nobody could ENTER or SEED data mid-chat"). So the DEFAULT posture is editable — a
// block given an `onEdit` renders its value as a compact inline field committing on blur/Enter; the
// read-only arm (no `onEdit`) is the honest-arms fallback (a model that can't write tools, a non-host
// viewer), never a silent degrade. The value TEXT is always the datum (§4.9) — this control IS that text
// when read-only, and an input pre-filled with it when editable.
import { Input } from "@orb/ui/input";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";
import { useState } from "react";

export interface TrackerValueProps {
  /** The current value, pre-formatted by the block (e.g. "24/30", "wary", "16"). */
  readonly display: string;
  /** The raw editable string (what seeds the input); defaults to `display`. */
  readonly editValue?: string;
  /** Commit handler — absent ⇒ READ-ONLY (the honest-arms arm). Present ⇒ editable-in-place. */
  readonly onEdit?: (next: string) => void;
  /** The input's semantic type — "text" | "numeric" drives inputMode/keyboard. @defaultValue "text" */
  readonly kind?: "text" | "numeric";
  /** Accessible name for the edit field (the tracker's label — "Vitality value"). */
  readonly ariaLabel: string;
  /** Text tone for the read-only display (the value is foreground by default; muted for secondary). */
  readonly tone?: ComponentProps<typeof Text>["tone"];
  /** Placeholder shown in the editable input when the value is empty — so an empty-but-editable field reads
   *  as intentionally-blank, not unfinished (§3.2). Ignored in the read-only arm (no input to hint). */
  readonly placeholder?: string;
  readonly className?: string;
}

/** The value cell: an inline editor when `onEdit` is set, else static datum text. */
export function TrackerValue({
  display,
  editValue,
  onEdit,
  kind = "text",
  ariaLabel,
  tone = "default",
  placeholder,
  className,
}: TrackerValueProps): ReactElement {
  const source = editValue ?? display;
  // Controlled echo of the external value, resettable while the user types. The prop wins on any external
  // change — done by tracking the previous source and resetting DURING render (never a setState-in-effect,
  // per react-hooks/set-state-in-effect + the [react-hooks/refs render ban] memory: the derived-state
  // pattern from the React docs, not an effect).
  const [draft, setDraft] = useState(source);
  const [lastSource, setLastSource] = useState(source);
  if (source !== lastSource) {
    setLastSource(source);
    setDraft(source);
  }

  if (onEdit === undefined) {
    return (
      <Text as="span" size="label" tone={tone} className={className}>
        {display}
      </Text>
    );
  }

  const commit = (): void => {
    if (draft !== source) {
      onEdit(draft);
    }
  };

  return (
    <Input
      aria-label={ariaLabel}
      {...(className === undefined ? {} : { className })}
      data-slot="tracker-value-edit"
      inputMode={kind === "numeric" ? "numeric" : "text"}
      {...(placeholder === undefined ? {} : { placeholder })}
      onBlur={commit}
      onKeyDown={(e): void => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      onValueChange={setDraft}
      value={draft}
    />
  );
}
