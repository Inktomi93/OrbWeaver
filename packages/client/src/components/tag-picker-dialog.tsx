// TagPickerDialog is client-shared across character and settings, built on FormDialog prompt mode rather
// than duplicating the tag-name dialog or moving data wiring into @orb/ui.
//
// Suggestions offer existing near-duplicates before a new spelling is authored; creation is explicit in
// the confirm label. Autocomplete inline keeps suggestions in flow: a popup can cover the footer or make
// the title/helper inaccessible in a small prompt. A prompt has no safe overlay space above or below its
// single field.
//
// tag.listTagsWithUsage shares the management collection query key and runs only while open. Opening
// beside a loaded roster is a cache hit; opening from the character library can require a fetch. Pending,
// failed, and empty reads remain distinct states with a visible retry; data ?? [] must not invite
// duplicate creation while the library is unresolved.
//
// Suggestions omit already attached tags, but the exact-name decision examines the whole library (#1488).
// An attached exact match refuses both confirm and Enter and explains why. A case-insensitive existing
// match submits the library's canonical spelling, not the typed spelling.

import { Autocomplete } from "@orb/ui/autocomplete";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import { useTRPC } from "#data";
import { sortTagsBy } from "#lib";
import { FormDialog } from "./form-dialog.tsx";

/** How many suggestions the inline list renders at once — a scroll of 400 is not a suggestion list (the
 *  box itself shows ~4 and scrolls, so this is the depth of the scroll, not the height of the box). */
const SUGGESTION_LIMIT = 8;

export interface TagPickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** The confirm button's label for the ATTACH-EXISTING arm (e.g. "Apply"). The create arm overrides it
   *  with its own `Create "<name>"` so the click always says which of the two things it does. */
  readonly confirmLabel: string;
  /** The text input's placeholder. @defaultValue "Search or create a tag" */
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
  // The field's PRIMARY job is finding a tag you already have; "e.g. adventure" invited inventing a name in
  // the one place where inventing one is the failure mode (side-eye 2026-08-03 P3).
  placeholder = "Search or create a tag",
  attachedNames = [],
  onSubmit,
}: TagPickerDialogProps): ReactElement {
  const trpc = useTRPC();
  const [name, setName] = useState("");
  const helperId = useId();
  // Gated on `open`: a closed picker costs nothing, and the key is shared with the Tags roster's own read.
  const libraryQuery = useQuery({ ...trpc.tag.listTagsWithUsage.queryOptions(), enabled: open });
  const library = libraryQuery.data ?? [];

  const attached = new Set(attachedNames.map((n) => n.toLowerCase()));
  // Most-used first — the same comparator the tag roster's default mode uses, because the tag you reach
  // for most is the one most likely to be the near-duplicate you were about to retype.
  const candidates = sortTagsBy(library, "used").filter((tag) => !attached.has(tag.name.toLowerCase()));
  const state = pickerState(libraryQuery.isPending, libraryQuery.isError, library.length, candidates.length);
  // Whether the library is KNOWN. Everything that claims a fact about it — "creates a new tag", the count,
  // the `Create "x"` confirm — is gated on this: an unread library cannot tell create from attach, and
  // guessing is how the confirm ends up naming the wrong one of the two things it is about to do.
  const known = state !== "loading" && state !== "error";

  const trimmed = name.trim();
  // MATCHED AGAINST THE WHOLE LIBRARY, never the offered candidates. `candidates` has the attached names
  // filtered OUT (they are no-op suggestions), so deriving the match from it made an already-attached tag
  // look UNKNOWN: typing the exact name of a tag the target already has read `Create "fantasy"`, i.e. this
  // dialog offering the duplicate spelling it exists to prevent. The filter belongs to the SUGGESTIONS; the
  // question "does this name already name a tag" is the library's.
  const existing = library.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
  const alreadyAttached = existing !== undefined && attached.has(existing.name.toLowerCase());
  const creating = known && trimmed !== "" && existing === undefined;
  // WE filter (`mode="none"` — Base UI shows exactly what we hand it) so the match count driving the list
  // is the same number it renders. Letting Base UI filter would mean guessing its predicate.
  //
  // AN EXACT MATCH ENDS THE SUGGESTING. Once the field holds a library tag's own spelling the decision is
  // made — the helper line says which tag it attaches, the confirm says Apply — and a list under that is
  // offering the state you are already in. It is also what gives the prompt its second Enter back: Base UI
  // KEEPS the highlight after a pick, so a still-open list swallows every subsequent Enter into re-picking
  // the same row instead of letting it reach the form (measured, this lane).
  const needle = trimmed.toLowerCase();
  // …EXCEPT WHERE THERE IS NO DECISION TO HAVE MADE. An exact match on an ALREADY-ATTACHED tag ends nothing:
  // its confirm is refused, so the user is mid-search, not finished — and closing the list there hid every
  // OTHER candidate the text still matches (attached "fantasy" beside a library "fantasy-noir" offered
  // nothing at all until the next keystroke). The ruling above survives; its input changed.
  const suggesting = trimmed !== "" && (existing === undefined || alreadyAttached);
  const matches = suggesting ? candidates.filter((tag) => tag.name.toLowerCase().includes(needle)).map((tag) => tag.name) : [];

  const close = (): void => {
    setName("");
    onOpenChange(false);
  };

  const confirm = (): void => {
    // An already-attached name has nothing to confirm — the submit is disabled for it, and this is the
    // keyboard path's half of the same refusal (Enter reaches here without touching the button).
    if (trimmed === "" || alreadyAttached) {
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
      submit={{ label: creating ? `Create "${trimmed}"` : confirmLabel, onSubmit: confirm, disabled: trimmed === "" || alreadyAttached }}
      title={title}
    >
      <Stack gap="field">
        <Autocomplete
          // The helper line carries the whole meaning of this dialog — which of create/attach the confirm
          // is about to do — and it was a bare paragraph nothing pointed at, so AT never heard any of it.
          aria-describedby={helperId}
          aria-label="Tag name"
          inline={true}
          items={matches}
          limit={SUGGESTION_LIMIT}
          mode="none"
          onValueChange={setName}
          // `inline` requires an unconditional open (Base UI forces it internally regardless); an empty
          // `items` is what collapses the list, so `matches` above is the real gate.
          open={true}
          placeholder={placeholder}
          value={name}
        />
        <Row align="center" gap="field">
          {/* ALWAYS VISIBLE, and now TRUE: with an empty field this is the library's state, and with text it
              is the sentence the confirm button is about to act on. `aria-live` because that flip (create ⇄
              attach) happens while the user is typing INTO the field it describes — a describedby alone is
              only read on focus, so the one moment it matters would be silent. */}
          <Text aria-live="polite" className="min-w-0 flex-1" id={helperId} voice="gloss">
            {helperText(state, candidates.length, trimmed, existing === undefined ? undefined : { name: existing.name, attached: alreadyAttached })}
          </Text>
          {state === "error" ? (
            <Button intent="secondary" onClick={(): void => void libraryQuery.refetch()} size="sm" type="button">
              Try again
            </Button>
          ) : null}
        </Row>
      </Stack>
    </FormDialog>
  );
}

/** The five situations a suggestion source can be in — they are NOT one "empty" state. Three of them are
 *  about the LIBRARY ("you have no tags at all", "you already have them all here", "you have some, start
 *  typing") and two are about the READ ("still loading", "the read failed"), and a picker that says the
 *  first sentence while in either of the last two is lying about the user's own data. None of the five is a
 *  dead end — every one of them still leads to creating. */
const PICKER_STATES = ["loading", "error", "empty", "exhausted", "ready"] as const;
type PickerState = (typeof PICKER_STATES)[number];

function pickerState(isPending: boolean, isError: boolean, libraryCount: number, candidateCount: number): PickerState {
  if (isError) {
    return "error";
  }
  // `isPending` (not `isFetching`): it stays true from the enabling of the query until the FIRST result, so
  // there is no frame in which the empty-library sentence renders over a library that simply hasn't arrived.
  if (isPending) {
    return "loading";
  }
  if (libraryCount === 0) {
    return "empty";
  }
  return candidateCount === 0 ? "exhausted" : "ready";
}

/** What the resting field says per state — a total Record (a sixth state is a tsc error). */
const RESTING_COPY: Record<PickerState, string | null> = {
  // No COUNT here: claiming a number while the read is in flight or broken is the defect, one sentence over.
  loading: "Loading your tags…",
  error: "Couldn't load your tags. You can still type a name — an existing one will be reused.",
  empty: "No tags yet — the name you type becomes your first one.",
  exhausted: "Every tag you have is already attached. A new name creates a new tag.",
  // `ready` counts its candidates, so its sentence is built rather than stored.
  ready: null,
};

/** The persistent line under the field — the library's state at rest, the confirm's sentence while typing.
 *  THREE typed arms, not two: create, attach, and the tag that is ALREADY on this target, whose honest
 *  sentence is that there is nothing left to do (its confirm is disabled, so the line is what explains it). */
function helperText(
  state: PickerState,
  candidateCount: number,
  trimmed: string,
  match: { readonly name: string; readonly attached: boolean } | undefined,
): string {
  if (trimmed !== "") {
    // Without the library there is no create-vs-attach FACT to state, so the sentence states the OUTCOME
    // both arms share (the server folds case on create, so this is true either way).
    if (state === "loading" || state === "error") {
      return `Applies the tag "${trimmed}".`;
    }
    if (match === undefined) {
      return `Creates a new tag "${trimmed}".`;
    }
    return match.attached ? `"${match.name}" is already attached.` : `Attaches the existing tag "${match.name}".`;
  }
  return RESTING_COPY[state] ?? `Start typing to search your ${candidateCount} tag${candidateCount === 1 ? "" : "s"}.`;
}
