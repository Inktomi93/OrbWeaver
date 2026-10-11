// The label inbox adopts or rejects the existing pending character junction.
import type { TagSuggestionView } from "@orb/contracts/tag";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import type { TableColumn } from "@orb/ui/table";
import { Table } from "@orb/ui/table";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { EditableTagChip, QueryBoundary, useAcceptSuggestion, useRejectSuggestion } from "#components";
import { QueryErrorState, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { selectCharacter, setActiveSection } from "#state";
import type { SuggestionGroup } from "../lib/label-suggestion-groups.ts";
import { groupSuggestions } from "../lib/label-suggestion-groups.ts";

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
  const [reviewed, setReviewed] = useState<ReviewedMark | null>(null);
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
  const groups = groupSuggestions(suggestions);
  if (groups.length === 0) {
    return (
      <Text role="status" ref={empty} tabIndex={-1} voice="gloss">
        No suggested tags awaiting review.
      </Text>
    );
  }
  const ordered = groups.flatMap((group) => group.rows);
  return (
    <Stack ref={root} gap="field">
      {groups.map((group) => (
        <SuggestionGroupBlock
          key={group.key}
          group={group}
          onReviewed={(row, button): void => setReviewed({ key: suggestionKey(row), index: ordered.indexOf(row), button })}
        />
      ))}
    </Stack>
  );
}

interface ReviewedMark {
  readonly key: string;
  readonly index: number;
  readonly button: HTMLButtonElement;
}

const suggestionKey = (suggestion: TagSuggestionView): string => `${suggestion.id}:${suggestion.characterId}`;

function SuggestionGroupBlock({
  group,
  onReviewed,
}: {
  readonly group: SuggestionGroup;
  readonly onReviewed: (row: TagSuggestionView, button: HTMLButtonElement) => void;
}): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const accept = useAcceptSuggestion({ trpc, invalidation });
  const [applyingAll, setApplyingAll] = useState(false);
  const first = group.rows[0];
  const columns: readonly TableColumn<TagSuggestionView>[] = [
    {
      id: "character",
      header: "Character",
      accessor: (row) => row.characterName,
      cell: (_value, row) => <SuggestionCharacter suggestion={row} groupName={group.name} />,
    },
    {
      id: "review",
      header: "Review",
      accessor: () => null,
      align: "end",
      cell: (_value, row) => <SuggestionRow suggestion={row} onReviewed={(button): void => onReviewed(row, button)} />,
    },
  ];
  if (first === undefined) {
    return null;
  }
  return (
    <Stack gap="field" role="group" aria-label={`Suggested ${group.name}`}>
      <Row align="center" className="flex-wrap" gap="field">
        <EditableTagChip tag={first} />
        <Text voice="gloss">{group.rows.length === 1 ? "1 character" : `${String(group.rows.length)} characters`}</Text>
        <Button
          intent="secondary"
          size="sm"
          type="button"
          disabled={applyingAll}
          onClick={(event): void => {
            const button = event.currentTarget;
            const focused = document.activeElement === button;
            setApplyingAll(true);
            // @orb-waive caught-failure-ownership(Promise.allSettled): allSettled never rejects; each failed attach already raises the mutation's own error toast, and the catch only releases the busy flag.
            Promise.allSettled(
              group.rows.map((row) => accept.mutateAsync({ tagId: row.id, targetType: "character" as const, targetId: row.characterId, status: "accepted" })),
            )
              .then((results) => {
                setApplyingAll(false);
                const applied = results.filter((result) => result.status === "fulfilled").length;
                if (applied > 0) {
                  notify.success(`Applied ${group.name} to ${String(applied)} ${applied === 1 ? "character" : "characters"}.`);
                  if (focused) {
                    onReviewed(first, button);
                  }
                }
              })
              .catch(() => setApplyingAll(false));
          }}
        >
          Apply to all
        </Button>
      </Row>
      {/* `w-fit`: the table is as wide as its two columns, so a name's verbs sit beside it instead of a pane-width away. */}
      <Table
        aria-label={`Characters suggested ${group.name}`}
        className="w-fit max-w-full"
        columns={columns}
        data={group.rows}
        defaultPagination={{ pageIndex: 0, pageSize: group.rows.length }}
        getRowId={suggestionKey}
      />
    </Stack>
  );
}

function SuggestionCharacter({ suggestion, groupName }: { readonly suggestion: TagSuggestionView; readonly groupName: string }): ReactElement {
  return (
    <Row align="center" className="flex-wrap" gap="field">
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
      {suggestion.name === groupName ? null : <Text voice="gloss">{suggestion.name}</Text>}
    </Row>
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
    // No wrap: Apply and Reject are one pair, and the table gives this cell its own width.
    <Row align="center" gap="field" justify="end" role="group" aria-label={`Suggested ${suggestion.name} for ${suggestion.characterName}`}>
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
