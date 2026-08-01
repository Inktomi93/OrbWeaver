// The character-editor tag-suggestion strip — a self-contained companion to CharacterTagsRow. Renders the
// staged (pending) auto/card tag suggestions distinctly from the accepted chips, each with Accept/Reject,
// plus "Suggest tags" (runs the on-demand distill producer) and a "Manage tags" deep-link to Settings →
// Tags via the shell store's `openSettingsTo` seam (no settings feature import).
//
// VOICE (density-pass-spec §3.2 CD3 — one focal element per surface): a suggestion is PENDING metadata, so
// it is the quietest thing on the editor. The chips are muted `soft` badges — accent FILL is reserved for
// the accepted tags in CharacterTagsRow, and `info` blue (which this surface uses nowhere else) is banned
// here: twelve filled blue pills outshouted the character's own name and the one primary CTA (stickler
// 2026-08-01 F3). The strip also stays SHORT by default — the overflow past `COLLAPSED_LIMIT` hides behind
// a "+N more" disclosure instead of wrapping four rows of chrome across the band.

import type { TagSuggestionView } from "@orb/contracts/tag";
import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Check, Icon, Settings, Sparkles, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { openSettingsTo } from "#state";
import { useAcceptSuggestion, useRejectSuggestion, useSuggestCharacterTags } from "../hooks/use-tag-suggestion-mutations";

const TAGS_SETTINGS_CATEGORY = "tags";

/** How many suggestion chips the strip shows at rest — the rest ride the "+N more" disclosure. */
const COLLAPSED_LIMIT = 5;

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

  const [expanded, setExpanded] = useState(false);
  const pending: readonly TagSuggestionView[] = suggestions ?? [];
  const shown = expanded ? pending : pending.slice(0, COLLAPSED_LIMIT);
  const hidden = pending.length - shown.length;
  return (
    <Row gap="field" align="center" className="flex-wrap" data-slot="character-tag-suggestions">
      {pending.length > 0 && (
        <Row gap="field" align="center" className="flex-wrap">
          <Text size="micro" weight="semibold" tone="muted" transform="caps">
            Suggested
          </Text>
          {shown.map((suggestion) => (
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
          {hidden > 0 || expanded ? (
            <Button type="button" size="sm" intent="ghost" onClick={(): void => setExpanded(!expanded)}>
              {expanded ? "Show fewer" : `+${hidden} more`}
            </Button>
          ) : null}
        </Row>
      )}
      <Button type="button" size="sm" intent="ghost" disabled={suggest.isPending} onClick={(): void => suggest.mutate({ characterId })}>
        <Icon icon={Sparkles} size="sm" />
        {suggest.isPending ? "Suggesting…" : "Suggest tags"}
      </Button>
      <Button type="button" size="sm" intent="ghost" onClick={(): void => openSettingsTo(TAGS_SETTINGS_CATEGORY)}>
        <Icon icon={Settings} size="sm" />
        Manage tags
      </Button>
    </Row>
  );
}

/** One pending suggestion — a muted `soft` chip (never `info`, never a fill: CD3) carrying the same
 *  accept/dismiss pair the strip has always had. No per-chip sparkle: twelve of them read as decoration,
 *  and the one on "Suggest tags" already names the producer. */
function SuggestionChip({ name, onAccept, onReject }: { readonly name: string; readonly onAccept: () => void; readonly onReject: () => void }): ReactElement {
  return (
    <Badge intent="neutral" tone="soft" size="sm">
      {name}
      <Button type="button" size="icon" intent="ghost" aria-label={`Accept ${name}`} onClick={onAccept}>
        <Icon icon={Check} size="xs" />
      </Button>
      <Button type="button" size="icon" intent="ghost" aria-label={`Dismiss ${name}`} onClick={onReject}>
        <Icon icon={X} size="xs" />
      </Button>
    </Badge>
  );
}
