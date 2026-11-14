// The chat's Memory tab: what the story remembers, in plain parts, with the host's strike and restore of one scene.
//
// A member reads the same list, struck items included, and gets no control: the view carries strike ids to the host
// only, and `isHost` omits the controls. A refusal reads on the row that caused it, never as a toast. A stale strike
// (the scene was summarized again while the list was open) refreshes the list and keeps its line on the same row,
// matched by the row's position rather than the hash that changed. The tier, block and score readout is the host's
// "Recall detail" section, the one place those words appear.

import type { MemoryItemKey, MemoryItemView, MemoryView, ParticipantView, UnmatchedStrikeView } from "@orb/contracts/chat";
import { CHAT_NOT_HOST_OP_CODE, MEMORY_ITEM_STALE_OP_CODE } from "@orb/contracts/chat";
import type { CharacterId, ChatId, ChatMemoryStrikeId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { EmptyState } from "@orb/ui/empty-state";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { trpcErrorReason } from "#lib";
import { useRestoreMemory, useSetMemoryEnabled, useStartMemoryBackfill, useStrikeMemory } from "../hooks/use-memory-mutations.ts";
import {
  MEMORY_CHANGED_SINCE_STRIKE_NOTE,
  MEMORY_EVERYONE_REMEMBERS,
  MEMORY_LEFT_SPEAKER,
  MEMORY_RECALL_DETAIL_HEADING,
  MEMORY_RECENT_WINDOW_NOTE,
  MEMORY_REFUSED_NOT_HOST,
  MEMORY_REFUSED_OTHER,
  MEMORY_REFUSED_STALE,
  MEMORY_RESTORE_LABEL,
  MEMORY_RETELLS_STRUCK_NOTE,
  MEMORY_STATUS_COPY,
  MEMORY_STRIKE_LABEL,
  MEMORY_STRUCK_NOTE,
  MEMORY_TURN_ON_LABEL,
  MEMORY_UNMATCHED_HEADING,
  MEMORY_UNMATCHED_NOTE,
  MEMORY_UNMATCHED_UNTITLED,
  MEMORY_UNTITLED_SCENE,
  MEMORY_VIEW_LOAD_SUBJECT,
  memoryRestoreName,
  memoryScopedRemembersLabel,
  memorySpeakersLabel,
  memoryStrikeName,
} from "../lib/memory-view-copy.ts";
import { DisclosureSection } from "./chat-context-disclosure-section.tsx";
import { MemoryOnConfirm } from "./memory-on-confirm.tsx";
import { RecallHostDetail } from "./memory-recall-detail.tsx";

export interface MemoryViewTabProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
  readonly participants: readonly ParticipantView[];
}

const REFUSAL_KINDS = ["not-host", "stale", "other"] as const;
type RefusalKind = (typeof REFUSAL_KINDS)[number];
type EmptyStatus = Exclude<MemoryView["status"], { readonly kind: "ready" }>;

/** Where a refusal shows: an item's grid position (it survives the re-summary a stale refusal reports), or a strike. */
interface Refusal {
  readonly at: string;
  readonly kind: RefusalKind;
}

const REFUSAL_COPY = { "not-host": MEMORY_REFUSED_NOT_HOST, stale: MEMORY_REFUSED_STALE, other: MEMORY_REFUSED_OTHER } as const satisfies Record<
  RefusalKind,
  string
>;

const RECALL_DETAIL_SECTION_ID = "memory-recall-detail";

function refusalKindOf(error: unknown): RefusalKind {
  const reason = trpcErrorReason(error);
  if (reason === CHAT_NOT_HOST_OP_CODE) {
    return "not-host";
  }
  return reason === MEMORY_ITEM_STALE_OP_CODE ? "stale" : "other";
}

function positionOf(key: MemoryItemKey): string {
  return `${key.scopedCharacterId}:${key.tier}:${key.blockIdx}`;
}

export function MemoryViewTab(props: MemoryViewTabProps): ReactElement {
  return (
    <Stack gap="section">
      <QueryBoundary
        resetKeys={[props.chatId]}
        fallback={<SkeletonRows count={3} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label={MEMORY_VIEW_LOAD_SUBJECT} onRetry={retry} />}
      >
        <MemoryViewBody {...props} />
      </QueryBoundary>
      {props.isHost ? (
        <DisclosureSection defaultOpen={false} kicker={MEMORY_RECALL_DETAIL_HEADING} sectionId={RECALL_DETAIL_SECTION_ID}>
          <RecallHostDetail chatId={props.chatId} />
        </DisclosureSection>
      ) : null}
    </Stack>
  );
}

function MemoryViewBody({ chatId, isHost, participants }: MemoryViewTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // No bus event follows the detached memory build, so opening the tab always reads afresh.
  const { data: view } = useSuspenseQuery({ ...trpc.chat.memoryView.queryOptions({ chatId }), refetchOnMount: "always" });
  const strike = useStrikeMemory({ trpc, invalidation });
  const restore = useRestoreMemory({ trpc, invalidation });
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const names = new Map(participants.flatMap((p) => (p.characterId === null || p.leftSeq !== null ? [] : [[p.characterId, p.displayName] as const])));
  const nameOf = (id: CharacterId): string => names.get(id) ?? MEMORY_LEFT_SPEAKER;

  const run = (at: string, write: () => Promise<unknown>): void => {
    setRefusal(null);
    write().catch((error: unknown) => setRefusal({ at, kind: refusalKindOf(error) }));
  };
  const controls: RowControls | null = isHost
    ? {
        pending: strike.isPending || restore.isPending,
        strike: (key): void => run(positionOf(key), () => strike.mutateAsync({ chatId, item: key })),
        restore: (at, strikeId): void => run(at, () => restore.mutateAsync({ chatId, strikeId })),
      }
    : null;

  if (view.status.kind !== "ready") {
    return <MemoryStatusLine status={view.status} isHost={isHost} />;
  }
  return (
    <Stack gap="block">
      <Stack gap="row" role="list" data-memory-status="ready">
        {view.items.map((item) => (
          <MemoryItemRow
            key={positionOf(item.key)}
            item={item}
            nameOf={nameOf}
            controls={controls}
            refusal={refusal?.at === positionOf(item.key) ? refusal.kind : null}
          />
        ))}
      </Stack>
      <UnmatchedStrikes view={view} controls={controls} refusal={refusal} />
      {view.recentWindowStartsAt === null ? null : <Text voice="gloss">{MEMORY_RECENT_WINDOW_NOTE}</Text>}
    </Stack>
  );
}

interface RowControls {
  readonly pending: boolean;
  readonly strike: (key: MemoryItemKey) => void;
  readonly restore: (at: string, strikeId: ChatMemoryStrikeId) => void;
}

function statusCopyOf(status: EmptyStatus, isHost: boolean): (typeof MEMORY_STATUS_COPY)[keyof typeof MEMORY_STATUS_COPY] {
  switch (status.kind) {
    case "off":
      if (status.reason === "app-off") {
        return MEMORY_STATUS_COPY.appOff;
      }
      return isHost ? MEMORY_STATUS_COPY.hostOffForHost : MEMORY_STATUS_COPY.hostOff;
    case "too-short":
      return MEMORY_STATUS_COPY.tooShort;
    case "pending":
      return MEMORY_STATUS_COPY.pending;
    case "before-your-history":
      return MEMORY_STATUS_COPY.beforeYourHistory;
  }
}

function MemoryStatusLine({ status, isHost }: { readonly status: EmptyStatus; readonly isHost: boolean }): ReactElement {
  const copy = statusCopyOf(status, isHost);
  const hostCanTurnOn = isHost && status.kind === "off" && status.reason === "host-off";
  return (
    <Stack data-memory-status={status.kind === "off" ? status.reason : status.kind}>
      {/* Only the host's own switch is this tab's to offer; every other status is a state of the room the player waits on. */}
      <EmptyState title={copy.title} description={copy.description} action={hostCanTurnOn ? <MemoryTurnOnDoor /> : null} />
    </Stack>
  );
}

/** The host's Memory switch behind the same cost confirm the memory chip and Settings use. */
function MemoryTurnOnDoor(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetMemoryEnabled({ trpc, invalidation, failureShownInline: "the turn-on-memory confirm's alert line" });
  const startBackfill = useStartMemoryBackfill({ trpc, invalidation, failureShownInline: "the turn-on-memory confirm's alert line" });
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" type="button" onClick={(): void => setConfirming(true)}>
        {MEMORY_TURN_ON_LABEL}
      </Button>
      <MemoryOnConfirm
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={async (buildExisting): Promise<void> => {
          await setEnabled.mutateAsync({ section: "memory", patch: { enabled: true } });
          if (buildExisting) {
            await startBackfill.mutateAsync({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
          }
        }}
      />
    </>
  );
}

function strikeStateOf(item: MemoryItemView): "struck" | "retells" | "none" {
  if (item.strike !== null) {
    return "struck";
  }
  return item.retellsStruck ? "retells" : "none";
}

function MemoryItemRow({
  item,
  nameOf,
  controls,
  refusal,
}: {
  readonly item: MemoryItemView;
  readonly nameOf: (id: CharacterId) => string;
  readonly controls: RowControls | null;
  readonly refusal: RefusalKind | null;
}): ReactElement {
  const scene = item.topicAnchor ?? MEMORY_UNTITLED_SCENE;
  const state = strikeStateOf(item);
  const remembers = item.bucket === "shared" ? MEMORY_EVERYONE_REMEMBERS : memoryScopedRemembersLabel(nameOf(item.key.scopedCharacterId));
  return (
    <Card role="listitem" dashed={state !== "none"} data-memory-strike={state} data-memory-bucket={item.bucket}>
      <Stack gap="field">
        <Text voice="label">{scene}</Text>
        {state === "struck" ? (
          <Row align="center" gap="field" wrap={true}>
            <Badge tone="warning">{MEMORY_STRUCK_NOTE}</Badge>
            {item.strike?.changedSinceStrike === true ? (
              <Text voice="gloss" data-memory-changed="true">
                {MEMORY_CHANGED_SINCE_STRIKE_NOTE}
              </Text>
            ) : null}
          </Row>
        ) : null}
        {state === "retells" ? <Badge tone="neutral">{MEMORY_RETELLS_STRUCK_NOTE}</Badge> : null}
        <Text prose={true} cap="prose" wrap="word">
          {item.text}
        </Text>
        {item.keywords.length === 0 ? null : (
          <Row gap="field" wrap={true}>
            {item.keywords.map((keyword) => (
              <Badge key={keyword} tone="neutral" variant="outline">
                {keyword}
              </Badge>
            ))}
          </Row>
        )}
        <Text voice="gloss">{item.speakers.length === 0 ? remembers : `${remembers}. ${memorySpeakersLabel(item.speakers.map(nameOf))}`}</Text>
        <ItemControl item={item} scene={scene} controls={controls} />
        {refusal === null ? null : <RefusalLine kind={refusal} />}
      </Stack>
    </Card>
  );
}

/** Strike on a plain item, Restore on the struck one; an item left out with a struck scene has neither, since recall
 *  already drops it and a second strike would name a span already struck. */
function ItemControl({
  item,
  scene,
  controls,
}: {
  readonly item: MemoryItemView;
  readonly scene: string;
  readonly controls: RowControls | null;
}): ReactElement | null {
  if (controls === null || item.retellsStruck) {
    return null;
  }
  const strikeId = item.strike?.strikeId ?? null;
  if (item.strike !== null) {
    return strikeId === null ? null : (
      <Button
        self="start"
        size="sm"
        variant="outline"
        type="button"
        disabled={controls.pending}
        aria-label={memoryRestoreName(scene)}
        onClick={(): void => controls.restore(positionOf(item.key), strikeId)}
      >
        {MEMORY_RESTORE_LABEL}
      </Button>
    );
  }
  return (
    <Button
      self="start"
      size="sm"
      variant="outline"
      type="button"
      disabled={controls.pending}
      aria-label={memoryStrikeName(scene)}
      onClick={(): void => controls.strike(item.key)}
    >
      {MEMORY_STRIKE_LABEL}
    </Button>
  );
}

function RefusalLine({ kind }: { readonly kind: RefusalKind }): ReactElement {
  return (
    <Text role="alert" voice="gloss" tone="warning" data-refusal={kind}>
      {REFUSAL_COPY[kind]}
    </Text>
  );
}

function UnmatchedStrikes({
  view,
  controls,
  refusal,
}: {
  readonly view: MemoryView;
  readonly controls: RowControls | null;
  readonly refusal: Refusal | null;
}): ReactElement | null {
  if (view.unmatchedStrikes.length === 0) {
    return null;
  }
  return (
    <Section heading={<Text voice="kicker">{MEMORY_UNMATCHED_HEADING}</Text>}>
      <Stack gap="row">
        <Text voice="gloss">{MEMORY_UNMATCHED_NOTE}</Text>
        <Stack gap="row" role="list" data-memory-unmatched="true">
          {view.unmatchedStrikes.map((strike, index) => (
            <UnmatchedRow
              // A member's rows carry no id; the list order is the server's and stable between reads.
              key={strike.strikeId ?? `unmatched-${index}`}
              strike={strike}
              controls={controls}
              refusal={strike.strikeId !== null && refusal?.at === strike.strikeId ? refusal.kind : null}
            />
          ))}
        </Stack>
      </Stack>
    </Section>
  );
}

function UnmatchedRow({
  strike,
  controls,
  refusal,
}: {
  readonly strike: UnmatchedStrikeView;
  readonly controls: RowControls | null;
  readonly refusal: RefusalKind | null;
}): ReactElement {
  const scene = strike.topicAnchor ?? MEMORY_UNMATCHED_UNTITLED;
  const { strikeId } = strike;
  return (
    <Card role="listitem" dashed={true}>
      <Stack gap="field">
        <Text voice="label">{scene}</Text>
        {controls === null || strikeId === null ? null : (
          <Button
            self="start"
            size="sm"
            variant="outline"
            type="button"
            disabled={controls.pending}
            aria-label={memoryRestoreName(scene)}
            onClick={(): void => controls.restore(strikeId, strikeId)}
          >
            {MEMORY_RESTORE_LABEL}
          </Button>
        )}
        {refusal === null ? null : <RefusalLine kind={refusal} />}
      </Stack>
    </Card>
  );
}
