// TagPickerDialog — the client-shared tag-name prompt (W1 rollup). Four sites across TWO features hand-
// rolled the byte-identical "type a tag name → Apply/Create" Dialog (character bulk-bar + tags-row,
// settings tag-create-button). Built ON FormDialog's PROMPT mode. OWNER RULING: lives client-shared (spans
// character + settings — the RowActionsMenu/ConfirmDialog precedent; NOT @orb/ui — ui stays parts-only).
//
// IT SUGGESTS NOW (tag-experience audit 2026-08-03, the register's highest value-per-effort row). It was a
// bare `Input` on both lineages: at the owner's ~400-tag library, typing "fan" with no suggestions is
// exactly how "fantasy", "Fantasy" and "fantsy" become three tags. The two things that fix duplicate rot
// are both here — the near-duplicate is OFFERED before it can be retyped, and CREATING is a labelled act
// (the confirm reads `Create "fantsy"`, never a generic Apply that quietly mints a fourth spelling).
//
// THE READ: `tag.listTagsWithUsage`, the SAME query key the config rail's Tags collection uses, gated on
// `open` — so a picker opened while that roster is mounted is a cache hit with no request, and a picker
// opened from the character library (where nothing has loaded the tag library) pays exactly one fetch, once,
// shared by every later picker. The audit's "already cached, zero new fetches" premise is only true for the
// first case: `listTagsWithUsage` has no app-wide prefetch (its only two consumers live in features/tag).
//
// CANONICAL NAME ON THE WIRE: when the typed text case-insensitively matches an existing tag, the EXISTING
// tag's spelling is submitted, not the typed one — the server folds case on create, but sending "Fantasy"
// for a library that says "fantasy" is how a display-name drifts from what the user picked.

import { Autocomplete } from "@orb/ui/autocomplete";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { useTRPC } from "#data";
import { sortTagsBy } from "#lib";
import { FormDialog } from "./form-dialog";

/** How many suggestions the popup renders at once — a scroll of 400 is not a suggestion list. */
const SUGGESTION_LIMIT = 8;

export interface TagPickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** The confirm button's label for the ATTACH-EXISTING arm (e.g. "Apply"). The create arm overrides it
   *  with its own `Create "<name>"` so the click always says which of the two things it does. */
  readonly confirmLabel: string;
  /** The text input's placeholder. @defaultValue "e.g. adventure" */
  readonly placeholder?: string;
  /** Tag names ALREADY on the target — dropped from the suggestions (offering a tag that is already
   *  attached is a no-op affordance) and the reason the "everything is attached" empty state exists.
   *  Omit where the target is a SET whose members disagree (the bulk bar tags N characters at once). */
  readonly attachedNames?: readonly string[];
  /** Fires with the tag name on confirm — the EXISTING tag's spelling when one matched, else the trimmed
   *  typed text (the dialog closes + resets itself). */
  readonly onSubmit: (name: string) => void;
}

/** The tag-name prompt — a suggesting "Tag name" field over the existing library + a required-non-empty
 *  confirm that names its arm, over FormDialog. */
export function TagPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  placeholder = "e.g. adventure",
  attachedNames = [],
  onSubmit,
}: TagPickerDialogProps): ReactElement {
  const trpc = useTRPC();
  const [name, setName] = useState("");
  // Base UI's own open INTENT (typing / Escape / picking); the render below ANDs it with "there is
  // something to show", which is the half Base UI cannot know.
  const [popupOpen, setPopupOpen] = useState(false);
  // Gated on `open`: a closed picker costs nothing, and the key is shared with the Tags roster's own read.
  const library = useQuery({ ...trpc.tag.listTagsWithUsage.queryOptions(), enabled: open }).data ?? [];

  const attached = new Set(attachedNames.map((n) => n.toLowerCase()));
  // Most-used first — the same comparator the tag roster's default mode uses, because the tag you reach
  // for most is the one most likely to be the near-duplicate you were about to retype.
  const candidates = sortTagsBy(library, "used").filter((tag) => !attached.has(tag.name.toLowerCase()));
  const state = libraryState(library.length, candidates.length);

  const trimmed = name.trim();
  const existing = candidates.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
  const creating = trimmed !== "" && existing === undefined;
  // WE filter (`mode="none"` — Base UI shows exactly what we hand it) so the match count driving `open`
  // below is the same number the list renders. Letting Base UI filter would mean guessing its predicate.
  const needle = trimmed.toLowerCase();
  const matches = candidates.filter((tag) => tag.name.toLowerCase().includes(needle)).map((tag) => tag.name);

  const close = (): void => {
    setName("");
    onOpenChange(false);
  };

  const confirm = (): void => {
    if (trimmed === "") {
      return;
    }
    onSubmit(existing?.name ?? trimmed);
    close();
  };

  return (
    <FormDialog
      description={description}
      onOpenChange={(next): void => {
        // Reset the field on close so a reopened prompt never carries the last attempt's text.
        if (!next) {
          setName("");
        }
        onOpenChange(next);
      }}
      open={open}
      submit={{ label: creating ? `Create "${trimmed}"` : confirmLabel, onSubmit: confirm, disabled: trimmed === "" }}
      title={title}
    >
      <Stack gap="field">
        <Autocomplete
          aria-label="Tag name"
          items={matches}
          limit={SUGGESTION_LIMIT}
          mode="none"
          // NEVER an empty popup: it is an overlay anchored under the field, so with nothing to show it
          // would cover — and hide from AT — the confirm button it exists to send you to. With nothing to
          // suggest, the line below IS the whole answer.
          onOpenChange={setPopupOpen}
          onValueChange={setName}
          open={popupOpen && matches.length > 0}
          placeholder={placeholder}
          value={name}
        />
        {/* ALWAYS VISIBLE, because a popup is transient and covers things: with an empty field this is the
            library's state, and with text it is the sentence the confirm button is about to act on. */}
        <Text voice="gloss">{helperText(state, candidates.length, trimmed, existing?.name)}</Text>
      </Stack>
    </FormDialog>
  );
}

/** The three situations a suggestion source can be in — they are NOT one "empty" state: "you have no tags
 *  at all", "you already have them all here" and "you have some, start typing" want three different
 *  sentences, and none of them is a dead end (every one of them still leads to creating). */
const PICKER_LIBRARY_STATES = ["empty", "exhausted", "ready"] as const;
type PickerLibraryState = (typeof PICKER_LIBRARY_STATES)[number];

function libraryState(libraryCount: number, candidateCount: number): PickerLibraryState {
  if (libraryCount === 0) {
    return "empty";
  }
  return candidateCount === 0 ? "exhausted" : "ready";
}

/** What the resting field says per state — a total Record (a fourth state is a tsc error). */
const RESTING_COPY: Record<PickerLibraryState, string | null> = {
  empty: "No tags yet — the name you type becomes your first one.",
  exhausted: "Every tag you have is already attached. A new name creates a new tag.",
  // `ready` counts its candidates, so its sentence is built rather than stored.
  ready: null,
};

/** The persistent line under the field — the library's state at rest, the confirm's sentence while typing. */
function helperText(state: PickerLibraryState, candidateCount: number, trimmed: string, matched: string | undefined): string {
  if (trimmed !== "") {
    return matched === undefined ? `Creates a new tag "${trimmed}".` : `Attaches the existing tag "${matched}".`;
  }
  return RESTING_COPY[state] ?? `Start typing to search your ${candidateCount} tag${candidateCount === 1 ? "" : "s"}.`;
}
