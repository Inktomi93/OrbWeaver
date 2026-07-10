// The character-editor tag-SUGGESTION strip — a self-contained companion to CharacterTagsRow (mounted beside
// it under the hero). Renders the STAGED (`status:'pending'`) auto/card tag suggestions DISTINCTLY from the
// accepted chips (an `info`/accent pill with an Accept ✓ + Reject ✕ per suggestion), plus a "Suggest tags"
// button that runs the on-demand distill producer and a "Manage tags" deep-link to Settings → Tags.
//
// Kept SEPARATE from CharacterTagsRow (not folded in) so the accepted-tag strip stays a clean read of
// `CharacterDetail.tags` while this owns the whole review/produce lifecycle (its own query + three mutations).
// The pending read is owner-scoped server-side (tag.listPendingSuggestions); an empty queue collapses to just
// the two action buttons (no empty-state noise). Deep-link rides the shell store's opaque `openSettingsTo`
// seam — NO settings feature import (state action only), so #65's Tags-management screen stays decoupled.

import type { TagSuggestionView } from "@orb/contracts/tag";
import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Check/Settings/Sparkles/X/Icon fine (the character-tags-row.tsx precedent).
import { Check, Icon, Settings, Sparkles, X } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { openSettingsTo } from "#state";
import {
  useAcceptSuggestion,
  useRejectSuggestion,
  useSuggestCharacterTags,
} from "../hooks/use-tag-suggestion-mutations";

// The settings deep-link target — the Tags category id (opaque to the shell store; the settings shell
// validates it against its registry). One home for the literal (not scattered across call sites).
const TAGS_SETTINGS_CATEGORY = "tags";

export interface CharacterTagSuggestionsProps {
  readonly characterId: CharacterId;
  readonly trpc: Trpc;
}

/** The pending-suggestion review strip: distinct chips (Accept/Reject each) + "Suggest tags" + "Manage tags". */
export function CharacterTagSuggestions({
  characterId,
  trpc,
}: CharacterTagSuggestionsProps): ReactElement {
  const invalidation = useInvalidation();
  const { data: suggestions } = useQuery(
    trpc.tag.listPendingSuggestions.queryOptions({ characterId }),
  );
  const accept = useAcceptSuggestion({ trpc, invalidation });
  const reject = useRejectSuggestion({ trpc, invalidation });
  const suggest = useSuggestCharacterTags({ trpc, invalidation });

  const pending: readonly TagSuggestionView[] = suggestions ?? [];
  return (
    <Row gap="field" align="center" className="flex-wrap" data-slot="character-tag-suggestions">
      {pending.length > 0 && (
        <Text size="micro" tone="muted">
          {pending.length} {pending.length === 1 ? "suggestion" : "suggestions"}
        </Text>
      )}
      {pending.map((suggestion) => (
        <Badge key={suggestion.id} intent="info" size="sm">
          {/* Leading sparkle — the "staged suggestion" cue that doesn't ride on the accent token, which is
            near-achromatic in dark themes (info vs neutral badge is otherwise ~indistinguishable). */}
          <Icon icon={Sparkles} size="sm" />
          {suggestion.name}
          <Button
            type="button"
            size="icon"
            intent="ghost"
            aria-label={`Accept ${suggestion.name}`}
            onClick={(): void =>
              accept.mutate({
                tagId: suggestion.id,
                targetType: "character",
                targetId: characterId,
                status: "accepted",
              })
            }
          >
            <Icon icon={Check} size="xs" />
          </Button>
          <Button
            type="button"
            size="icon"
            intent="ghost"
            aria-label={`Dismiss ${suggestion.name}`}
            onClick={(): void =>
              reject.mutate({
                tagId: suggestion.id,
                targetType: "character",
                targetId: characterId,
              })
            }
          >
            <Icon icon={X} size="xs" />
          </Button>
        </Badge>
      ))}
      <Button
        type="button"
        size="sm"
        intent="ghost"
        disabled={suggest.isPending}
        onClick={(): void => suggest.mutate({ characterId })}
      >
        <Icon icon={Sparkles} size="sm" />
        {suggest.isPending ? "Suggesting…" : "Suggest tags"}
      </Button>
      <Button
        type="button"
        size="sm"
        intent="ghost"
        onClick={(): void => openSettingsTo(TAGS_SETTINGS_CATEGORY)}
      >
        <Icon icon={Settings} size="sm" />
        Manage tags
      </Button>
    </Row>
  );
}
