// TagPickerDialog is client-shared across character and settings, built on FormDialog prompt mode rather
// than duplicating the tag-name dialog or moving data wiring into @orb/ui.
//
// Suggestions offer existing near-duplicates before a new spelling is authored; creation is explicit in
// the confirm label. Autocomplete inline keeps suggestions in flow: a popup can cover the footer or make
// the title/helper inaccessible in a small prompt. A prompt has no safe overlay space above or below its
// single field.
//
// tag.listTagsWithUsage shares the management collection query key and runs only while open. Opening
// beside a loaded roster is a cache hit; opening from the character library can require a fetch. The field
// stays mounted and typeable while the library loads or fails, and a QueryBoundary beside it shows the
// shared loading and error states. The suggestions, the create-or-attach line and the `Create "x"` confirm
// wait for a known library, so an unresolved library never invites duplicate creation.
//
// Suggestions omit already attached tags, but the exact-name decision examines the whole library (#1488).
// An attached exact match refuses both confirm and Enter and explains why. A case-insensitive existing
// match submits the library's canonical spelling, not the typed spelling.

import { Autocomplete } from "@orb/ui/autocomplete";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { sortTagsBy } from "#lib";
import { FormDialog } from "./form-dialog.tsx";
import { QueryBoundary } from "./query-boundary.tsx";
import { TAG_NAME_FIELD_NAME } from "./shared-control-names.ts";

/** How many suggestions the inline list renders at once — a scroll of 400 is not a suggestion list (the
 *  box itself shows ~4 and scrolls, so this is the depth of the scroll, not the height of the box). */
const SUGGESTION_LIMIT = 8;

type TagLibrary = inferOutput<Trpc["tag"]["listTagsWithUsage"]>;

export interface TagPickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** The confirm button's label for the ATTACH-EXISTING arm (e.g. "Apply"). The create arm overrides it
   *  with its own `Create "<name>"` so the click always says which of the two things it does. */
  readonly confirmLabel: string;
  /** Tag names ALREADY on the target — dropped from the suggestions (offering a tag that is already
   *  attached is a no-op affordance) and the reason the "everything is attached" empty state exists.
   *  Omit where the target is a SET whose members disagree (the bulk bar tags N characters at once). */
  readonly attachedNames?: readonly string[];
  /** Fires with the tag name on confirm — the EXISTING tag's spelling when one matched, else the trimmed
   *  typed text (the dialog closes + resets itself). */
  readonly onSubmit: (name: string) => void;
}

const NONE: readonly never[] = [];

/** The tag-name prompt — a suggesting "Tag name" field over the existing library + a required-non-empty
 *  confirm that names its arm, over FormDialog. */
export function TagPickerDialog({ open, onOpenChange, title, description, confirmLabel, attachedNames = NONE, onSubmit }: TagPickerDialogProps): ReactElement {
  const trpc = useTRPC();
  const [name, setName] = useState("");
  const helperId = useId();
  // The suggestions and the confirm's arm read the library once it is known; the boundary below owns its loading and failure.
  const { data: library } = useQuery({ ...trpc.tag.listTagsWithUsage.queryOptions(), enabled: open });
  const trimmed = name.trim();
  const claim = library === undefined ? undefined : libraryClaim(library, attachedNames, trimmed);
  const alreadyAttached = claim?.match?.attached === true;
  const creating = claim !== undefined && trimmed !== "" && claim.match === undefined;

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
    onSubmit(claim?.match?.name ?? trimmed);
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
          aria-label={TAG_NAME_FIELD_NAME}
          inline={true}
          items={claim?.matches ?? NONE}
          limit={SUGGESTION_LIMIT}
          mode="none"
          onValueChange={setName}
          // `inline` requires an unconditional open (Base UI forces it internally regardless); an empty
          // `items` is what collapses the list, so `matches` is the real gate.
          open={true}
          // The field's PRIMARY job is finding a tag you already have; "e.g. adventure" invited inventing a
          // name in the one place where inventing one is the failure mode.
          placeholder="Search or create a tag…"
          value={name}
        />
        {/* ONE live line across the read: `aria-live` because the create ⇄ attach flip happens while the user is
            typing INTO the field it describes, and a describedby alone is only read on focus. */}
        <Text aria-live="polite" id={helperId} voice="gloss">
          {claim === undefined ? unknownLibraryText(trimmed) : helperText(claim, trimmed)}
        </Text>
        <QueryBoundary
          resetKeys={[]}
          fallback={<SkeletonRows count={1} />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="your tags" onRetry={retry} />}
        >
          <LibraryRead />
        </QueryBoundary>
      </Stack>
    </FormDialog>
  );
}

/** Suspends on the library so its loading and failure reach the shared states; the line above states what it knows. */
function LibraryRead(): null {
  const trpc = useTRPC();
  useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  return null;
}

interface LibraryClaim {
  readonly state: PickerState;
  readonly candidateCount: number;
  /** The library tag the typed name already names, matched case-insensitively. */
  readonly match: { readonly name: string; readonly attached: boolean } | undefined;
  readonly matches: readonly string[];
}

/** What a known library says about the typed name: the suggestions it offers and the tag the name already names. */
function libraryClaim(library: TagLibrary, attachedNames: readonly string[], trimmed: string): LibraryClaim {
  const attached = new Set(attachedNames.map((n) => n.toLowerCase()));
  // Most-used first — the same comparator the tag roster's default mode uses, because the tag you reach
  // for most is the one most likely to be the near-duplicate you were about to retype.
  const candidates = sortTagsBy(library, "used").filter((tag) => !attached.has(tag.name.toLowerCase()));
  // MATCHED AGAINST THE WHOLE LIBRARY, never the offered candidates. `candidates` has the attached names
  // filtered OUT (they are no-op suggestions), so deriving the match from it made an already-attached tag
  // look UNKNOWN: typing the exact name of a tag the target already has read `Create "fantasy"`, i.e. this
  // dialog offering the duplicate spelling it exists to prevent. The filter belongs to the SUGGESTIONS; the
  // question "does this name already name a tag" is the library's.
  const needle = trimmed.toLowerCase();
  const existing = library.find((tag) => tag.name.toLowerCase() === needle);
  const alreadyAttached = existing !== undefined && attached.has(existing.name.toLowerCase());
  // WE filter (`mode="none"` — Base UI shows exactly what we hand it) so the match count driving the list
  // is the same number it renders. Letting Base UI filter would mean guessing its predicate.
  //
  // AN EXACT MATCH ENDS THE SUGGESTING. Once the field holds a library tag's own spelling the decision is
  // made — the helper line says which tag it attaches, the confirm says Apply — and a list under that is
  // offering the state you are already in. It is also what gives the prompt its second Enter back: Base UI
  // KEEPS the highlight after a pick, so a still-open list swallows every subsequent Enter into re-picking
  // the same row instead of letting it reach the form.
  //
  // …EXCEPT WHERE THERE IS NO DECISION TO HAVE MADE. An exact match on an ALREADY-ATTACHED tag ends nothing:
  // its confirm is refused, so the user is mid-search, not finished — and closing the list there hid every
  // OTHER candidate the text still matches (attached "fantasy" beside a library "fantasy-noir").
  const suggesting = trimmed !== "" && (existing === undefined || alreadyAttached);
  return {
    state: pickerState(library.length, candidates.length),
    candidateCount: candidates.length,
    match: existing === undefined ? undefined : { name: existing.name, attached: alreadyAttached },
    matches: suggesting ? candidates.filter((tag) => tag.name.toLowerCase().includes(needle)).map((tag) => tag.name) : NONE,
  };
}

/** The three situations a loaded suggestion source can be in: you have no tags at all, you already have them all
 *  here, or you have some to search. None is a dead end — every one still leads to creating. */
const PICKER_STATES = ["empty", "exhausted", "ready"] as const;
type PickerState = (typeof PICKER_STATES)[number];

function pickerState(libraryCount: number, candidateCount: number): PickerState {
  if (libraryCount === 0) {
    return "empty";
  }
  return candidateCount === 0 ? "exhausted" : "ready";
}

/** What the resting field says per state — a total Record (a fourth state is a tsc error). */
const RESTING_COPY: Record<PickerState, string | null> = {
  empty: "No tags yet. The name you type becomes your first one.",
  exhausted: "Every tag you have is already attached. A new name creates a new tag.",
  // `ready` counts its candidates, so its sentence is built rather than stored.
  ready: null,
};

/** The line while the library is unknown: no create-or-attach FACT can be stated, so it states the OUTCOME both arms
 *  share (the server folds case on create, so this holds either way). */
function unknownLibraryText(trimmed: string): string {
  return trimmed === "" ? "Type a tag name to apply." : `Applies the tag "${trimmed}".`;
}

/** The persistent line under the field — the library's state at rest, the confirm's sentence while typing.
 *  THREE typed arms, not two: create, attach, and the tag that is ALREADY on this target, whose honest
 *  sentence is that there is nothing left to do (its confirm is disabled, so the line is what explains it). */
function helperText(claim: LibraryClaim, trimmed: string): string {
  if (trimmed !== "") {
    if (claim.match === undefined) {
      return `Creates a new tag "${trimmed}".`;
    }
    return claim.match.attached ? `"${claim.match.name}" is already attached.` : `Attaches the existing tag "${claim.match.name}".`;
  }
  const count = claim.candidateCount;
  return RESTING_COPY[claim.state] ?? `Start typing to search your ${count} tag${count === 1 ? "" : "s"}.`;
}
