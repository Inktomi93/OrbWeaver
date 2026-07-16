// The character-editor tag-suggestion strip — a self-contained companion to CharacterTagsRow. Renders the
// staged (pending) auto/card tag suggestions distinctly from the accepted chips, each with Accept/Reject,
// plus "Suggest tags" (runs the on-demand distill producer) and a "Manage tags" deep-link to Settings →
// Tags via the shell store's `openSettingsTo` seam (no settings feature import).

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
import { openSettingsTo } from "#state";
import { useAcceptSuggestion, useRejectSuggestion, useSuggestCharacterTags } from "../hooks/use-tag-suggestion-mutations";

const TAGS_SETTINGS_CATEGORY = "tags";

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
            <Badge key={suggestion.id} intent="info" size="sm">
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
