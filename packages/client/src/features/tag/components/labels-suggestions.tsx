// The label inbox adopts or rejects the existing pending character junction.
import type { TagSuggestionView } from "@orb/contracts/tag";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { EditableTagChip, QueryBoundary, useAcceptSuggestion, useRejectSuggestion } from "#components";
import { QueryErrorState, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { selectCharacter, setActiveSection } from "#state";

export function LabelsSuggestions(): ReactElement {
  return (
    <Section heading="Suggested tags">
      <QueryBoundary
        fallback={<Skeleton className="h-16 w-full" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="suggested tags" onRetry={retry} />}
      >
        <SuggestionsBody />
      </QueryBoundary>
    </Section>
  );
}

function SuggestionsBody(): ReactElement {
  const trpc = useTRPC();
  const { data: suggestions } = useSuspenseQuery(trpc.tag.listPendingSuggestions.queryOptions());
  const root = useRef<HTMLDivElement>(null);
  const empty = useRef<HTMLParagraphElement>(null);
  const [reviewed, setReviewed] = useState<{ readonly key: string; readonly index: number; readonly button: HTMLButtonElement } | null>(null);
  const handledReview = useRef<typeof reviewed>(null);
  useEffect(() => {
    if (reviewed === null || handledReview.current === reviewed || suggestions.some((item) => `${item.id}:${item.characterId}` === reviewed.key)) {
      return;
    }
    // Readback owns removal; keep focus where the reader moved it while the write settled.
    if (!reviewed.button.isConnected && document.activeElement === document.body) {
      const actions = root.current?.querySelectorAll<HTMLButtonElement>('[data-slot="label-review-apply"]');
      if (actions !== undefined && actions.length > 0) {
        actions.item(Math.min(reviewed.index, actions.length - 1)).focus();
      } else {
        empty.current?.focus();
      }
    }
    handledReview.current = reviewed;
  }, [reviewed, suggestions]);
  if (suggestions.length === 0) {
    return (
      <Text role="status" ref={empty} tabIndex={-1} voice="gloss">
        No suggested tags awaiting review.
      </Text>
    );
  }
  return (
    <Stack ref={root} gap="field">
      {suggestions.map((suggestion, index) => (
        <SuggestionRow
          key={`${suggestion.id}:${suggestion.characterId}`}
          suggestion={suggestion}
          onReviewed={(button): void => setReviewed({ key: `${suggestion.id}:${suggestion.characterId}`, index, button })}
        />
      ))}
    </Stack>
  );
}

function SuggestionRow({
  suggestion,
  onReviewed,
}: {
  readonly suggestion: TagSuggestionView;
  readonly onReviewed: (button: HTMLButtonElement) => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const accept = useAcceptSuggestion({ trpc, invalidation });
  const reject = useRejectSuggestion({ trpc, invalidation });
  const target = { tagId: suggestion.id, targetType: "character" as const, targetId: suggestion.characterId };
  const pending = accept.isPending || reject.isPending;
  const failedAction = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const failedButton = failedAction.current;
    if (failedButton === null || pending) {
      return;
    }
    // Native disabling can blur the action; a refused write leaves that same action available.
    if (failedButton.isConnected && document.activeElement === document.body) {
      failedButton.focus();
    }
    failedAction.current = null;
  }, [pending]);
  return (
    <Row align="center" className="flex-wrap" gap="field" role="group" aria-label={`Suggested ${suggestion.name} for ${suggestion.characterName}`}>
      <Text voice="gloss">Suggested</Text>
      <EditableTagChip tag={suggestion} />
      <Button
        intent="ghost"
        size="sm"
        type="button"
        onClick={(): void => {
          selectCharacter(suggestion.characterId);
          setActiveSection("characters");
        }}
      >
        {suggestion.characterName}
      </Button>
      <Button
        data-slot="label-review-apply"
        intent="secondary"
        size="sm"
        type="button"
        disabled={pending}
        onClick={(event): void => {
          const button = event.currentTarget;
          const focused = document.activeElement === button;
          accept.mutate(
            { ...target, status: "accepted" },
            {
              onError: (): void => {
                if (focused) {
                  failedAction.current = button;
                }
              },
              onSuccess: (): void => {
                notify.success(`Applied ${suggestion.name}.`);
                if (focused) {
                  onReviewed(button);
                }
              },
            },
          );
        }}
      >
        Apply
      </Button>
      <Button
        intent="ghost"
        size="sm"
        type="button"
        disabled={pending}
        onClick={(event): void => {
          const button = event.currentTarget;
          const focused = document.activeElement === button;
          reject.mutate(target, {
            onError: (): void => {
              if (focused) {
                failedAction.current = button;
              }
            },
            onSuccess: (): void => {
              notify.success(`Rejected ${suggestion.name}.`);
              if (focused) {
                onReviewed(button);
              }
            },
          });
        }}
      >
        Reject
      </Button>
    </Row>
  );
}
