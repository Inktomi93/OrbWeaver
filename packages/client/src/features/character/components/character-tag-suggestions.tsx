// The character-editor tag-suggestion strip — a self-contained companion to CharacterTagsRow. Renders the
// staged (pending) auto/card tag suggestions distinctly from the accepted chips, each with Accept/Reject,
// plus "Suggest tags" (runs the on-demand distill producer). The "Manage tags" deep-link that used to sit
// beside it is gone — see the §8-ceiling note at its old position.
//
// VOICE (UI-Density-Law §3.2 CD3 — one focal element per surface): a suggestion is PENDING metadata, so
// it is the quietest thing on the editor. The chips are `ghost` badges — no fill, a hairline outline, the
// muted text tone, the micro type size. Accent FILL is reserved for the ACCEPTED tags in CharacterTagsRow,
// and `info` blue (which this surface uses nowhere else) is banned here: twelve filled blue pills outshouted
// the character's own name and the one primary CTA (stickler 2026-08-01 F3).
//
// EVERY suggestion renders — no cap, no "+N more" disclosure (owner ruling 2026-08-01, D113 (4b): the read
// surface shows everything and WEIGHT solves loudness, not count; a disclosure hid pending metadata behind a
// click and still cost a control's worth of chrome).

import type { TagSuggestionView } from "@orb/contracts/tag";
import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Check, Icon, Sparkles, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { EditableTagChip, useAcceptSuggestion, useRejectSuggestion } from "#components";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { useSuggestCharacterTags } from "../hooks/use-tag-suggestion-mutations.ts";

export interface CharacterTagSuggestionsProps {
  readonly characterId: CharacterId;
  readonly trpc: Trpc;
}

/** The pending-suggestion review strip: distinct chips (Accept/Reject each) + "Suggest tags" + "Manage tags". */
export function CharacterTagSuggestions({ characterId, trpc }: CharacterTagSuggestionsProps): ReactElement {
  const invalidation = useInvalidation();
  // SUSPENDING, NOT POLLING INTO PLACE (#1133, side-eye 2026-09-02 F3). This strip sits ABOVE the greeting
  // bubble and used to render at zero height until its read landed, then appear — measured as
  // `[data-slot=character-greeting] moved 0px,84px` at 4387ms, an input-adjacent shift 240ms after the pane
  // had already filled. A `useQuery` cannot reserve anything (it has no pending shape to hand a boundary);
  // suspending hands the wait to the caller's `QueryBoundary`, which reserves the measured box (#885). The
  // read itself is unchanged.
  const { data: suggestions } = useSuspenseQuery(trpc.tag.listPendingSuggestions.queryOptions({ characterId }));
  const accept = useAcceptSuggestion({ trpc, invalidation });
  const reject = useRejectSuggestion({ trpc, invalidation });
  const suggest = useSuggestCharacterTags({ trpc, invalidation });

  const pending: readonly TagSuggestionView[] = suggestions;
  return (
    <Row gap="field" align="center" className="flex-wrap" data-slot="character-tag-suggestions">
      {pending.length > 0 && (
        // A NAMED GROUP, NOT TEN LOOSE BUTTONS (side-eye 2026-09-02 F13). The strip announced as `paragraph:
        // Suggested` followed by `Accept x` / `Dismiss x` ×5 with nothing binding them: a screen-reader user
        // entered ten consecutive controls with no idea what set they belonged to or how many were coming,
        // while the same surface's `group "Tags"` / `group "View"` / `group "Filters"` all do this correctly.
        // The COUNT is in the name because it is the fact that decides whether to walk the set at all, and it
        // is derived from the same array the chips are, so it cannot go stale.
        <Row
          aria-label={`Suggested tags, ${String(pending.length)}`}
          role="group"
          gap="field"
          align="center"
          className="flex-wrap"
          data-slot="character-tag-suggestion-group"
        >
          {/* The visible kicker stays: the group's accessible name is for AT, this is the sighted label. */}
          <Text voice="kicker">Suggested</Text>
          {pending.map((suggestion) => (
            <SuggestionChip
              key={suggestion.id}
              tag={suggestion}
              onAccept={(): void =>
                accept.mutate({
                  tagId: suggestion.id,
                  targetType: "character",
                  targetId: characterId,
                  status: "accepted",
                })
              }
              onReject={(): void =>
                reject.mutate({
                  tagId: suggestion.id,
                  targetType: "character",
                  targetId: characterId,
                })
              }
            />
          ))}
        </Row>
      )}
      {/* "MANAGE TAGS" IS GONE (side-eye 2026-08-03, the §8 four-option ceiling). One screen offered five
          competing doors for one concept — `+ Add tag`, accept/dismiss per suggestion, `Suggest tags`,
          `Manage tags` — and this was the one that left the card entirely. The tag LIBRARY has a home now
          (the Configuration workspace's Tags collection, one rail click away); a per-card shortcut to a
          sibling section is not a capability, it is a fifth option at a decision point that already had
          four. The three that remain all act on THIS card. */}
      <Button type="button" size="sm" intent="ghost" disabled={suggest.isPending} onClick={(): void => suggest.mutate({ characterId })}>
        <Icon icon={Sparkles} size="sm" />
        {suggest.isPending ? "Suggesting…" : "Suggest tags"}
      </Button>
    </Row>
  );
}

/** One pending suggestion — a `ghost` chip (no fill at all: CD3 reserves fill for the ACCEPTED tags) at the
 *  micro type size. The TrackerChip idiom: the quiet is carried by the Text voice inside the badge, not by a
 *  per-feature skin. No per-chip sparkle: a dozen of them read as decoration, and the one on "Suggest tags"
 *  already names the producer.
 *
 *  ONE CONTROL PER VERB, AND THE NAME IS THE ACCEPT TARGET (side-eye 2026-08-18 P2-5). The chip used to
 *  carry the name plus TWO `size="icon"` buttons, which at a coarse pointer are 44-48px boxes BY TOKEN
 *  (D62 P1, the touch floor — law, and not something a chip may shave). Two of them per chip ran the chips
 *  125-236px wide, so eleven of them could not pack a 382px phone column: measured row fills 164 · 330 ·
 *  211 · 193 · 236 · 372 · 333 · 177 of 382 — a median row ~55% full, 588px tall, 63% of the viewport,
 *  above the card's actual content. It read as a layout bug because geometrically it was one.
 *
 *  The fix is COUNT, not size: the accept verb moves onto the chip's own body (a ghost button whose
 *  accessible name is `Accept <tag>`, carrying the ✓ so the affordance is still legible), leaving ONE
 *  trailing dismiss. Both verbs survive, both keep the full touch floor, and every chip sheds an entire
 *  control box. This is NOT a re-litigation of D113(4b) — the cap ruling stands, every suggestion still
 *  renders; the block is simply allowed to pack. */
function SuggestionChip({
  tag,
  onAccept,
  onReject,
}: {
  readonly tag: TagSuggestionView;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}): ReactElement {
  const name = tag.name;
  return (
    // Each control already owns its padding and touch box; outer gaps prevent neighboring chips from packing.
    <Badge intent="neutral" tone="ghost" size="sm" className="gap-0 px-0 py-0">
      {/* THE LABEL RIDES THE `label` VOICE, NOT `gloss` (side-eye 2026-08-30 rail-characters P3, #843).
          `gloss` is the MICRO step (10.5px) — correct for the `Suggested` kicker, which is a footnote, and
          below the 11px functional floor for a CONTROL'S OWN LABEL. `design-audit` fired
          `undersized-ui-text` six times here on both the desktop and the coarse arm, and the finding is
          easy to mis-dismiss: the BUTTON computes 13px, the span inside it computed 10.5. The chip stays
          the quietest thing on the editor by the means CD3 actually names — no fill, a hairline outline —
          which this does not touch. */}
      <Button type="button" size="sm" intent="ghost" aria-label={`Accept ${name}`} className="min-w-0 max-w-full" onClick={onAccept}>
        <Icon icon={Check} size="xs" />
        <Text as="span" voice="label" className="min-w-0 truncate">
          {name}
        </Text>
      </Button>
      <EditableTagChip tag={tag} iconOnly={true} />
      <Button type="button" size="icon" intent="ghost" aria-label={`Dismiss ${name}`} onClick={onReject}>
        <Icon icon={X} size="xs" />
      </Button>
    </Badge>
  );
}
