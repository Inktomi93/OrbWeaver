// The character-editor tag-suggestion strip — a self-contained companion to CharacterTagsRow. Renders the
// staged (pending) auto/card tag suggestions distinctly from the accepted chips, each with Accept/Reject,
// plus "Suggest tags" (runs the on-demand distill producer) and a "Manage tags" deep-link to Settings →
// Tags via the shell store's `openSettingsTo` seam (no settings feature import).
//
// VOICE (density-pass-spec §3.2 CD3 — one focal element per surface): a suggestion is PENDING metadata, so
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
import { Check, Icon, Settings, Sparkles, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { goToCollection } from "#state";
import { useAcceptSuggestion, useRejectSuggestion, useSuggestCharacterTags } from "../hooks/use-tag-suggestion-mutations";

const TAGS_COLLECTION = "tags";

export interface CharacterTagSuggestionsProps {
  readonly characterId: CharacterId;
  readonly trpc: Trpc;
}

/** The pending-suggestion review strip: distinct chips (Accept/Reject each) + "Suggest tags" + "Manage tags". */
export function CharacterTagSuggestions({ characterId, trpc }: CharacterTagSuggestionsProps): ReactElement {
  const invalidation = useInvalidation();
  const { data: suggestions } = useQuery(trpc.tag.listPendingSuggestions.queryOptions({ characterId }));
  const accept = useAcceptSuggestion({ trpc, invalidation });
  const reject = useRejectSuggestion({ trpc, invalidation });
  const suggest = useSuggestCharacterTags({ trpc, invalidation });

  const pending: readonly TagSuggestionView[] = suggestions ?? [];
  return (
    <Row gap="field" align="center" className="flex-wrap" data-slot="character-tag-suggestions">
      {pending.length > 0 && (
        <Row gap="field" align="center" className="flex-wrap">
          <Text size="micro" weight="semibold" tone="muted" transform="caps">
            Suggested
          </Text>
          {pending.map((suggestion) => (
            <SuggestionChip
              key={suggestion.id}
              name={suggestion.name}
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
      <Button type="button" size="sm" intent="ghost" disabled={suggest.isPending} onClick={(): void => suggest.mutate({ characterId })}>
        <Icon icon={Sparkles} size="sm" />
        {suggest.isPending ? "Suggesting…" : "Suggest tags"}
      </Button>
      <Button type="button" size="sm" intent="ghost" onClick={(): void => goToCollection(TAGS_COLLECTION)}>
        <Icon icon={Settings} size="sm" />
        Manage tags
      </Button>
    </Row>
  );
}

/** One pending suggestion — a `ghost` chip (no fill at all: CD3 reserves fill for the ACCEPTED tags) at the
 *  micro type size, carrying the same accept/dismiss pair the strip has always had. The TrackerChip idiom:
 *  the quiet is carried by the Text voice inside the badge, not by a per-feature skin. No per-chip sparkle:
 *  a dozen of them read as decoration, and the one on "Suggest tags" already names the producer. */
function SuggestionChip({ name, onAccept, onReject }: { readonly name: string; readonly onAccept: () => void; readonly onReject: () => void }): ReactElement {
  return (
    <Badge intent="neutral" tone="ghost" size="sm">
      <Text as="span" size="micro" tone="muted">
        {name}
      </Text>
      <Button type="button" size="icon" intent="ghost" aria-label={`Accept ${name}`} onClick={onAccept}>
        <Icon icon={Check} size="xs" />
      </Button>
      <Button type="button" size="icon" intent="ghost" aria-label={`Dismiss ${name}`} onClick={onReject}>
        <Icon icon={X} size="xs" />
      </Button>
    </Badge>
  );
}
