// The header MEMORY-RECALL indicator (#313) — a STABLE topbar slot beside the members chip that reflects the
// CURRENT turn's `{{memory}}` recall, fed live off the room bus (`memoryRecall` → `useRecallState`), NOT a
// per-message chip (which would have to shift from the user row to the assistant row on submit). Three states:
//   • idle       — no recall this turn / memory off (a muted brain, never a lying count).
//   • recalling… — the pre-provider embed → cosine → CSLS → optional rerank WINDOW, a real round-trip BEFORE
//                  the provider streams. A reduced-motion-SAFE pulse (`motion-safe:animate-pulse`, never a
//                  spin — owner ruling): under `prefers-reduced-motion` it is a static labeled icon. This is
//                  also the "is my request hanging?" tell.
//   • retrieved N — recall closed; N blocks surfaced (0 renders as "no memories", never a bare 0 that reads
//                  like a bug).
// CLICK → a popover: the live phase/count always, plus (HOST only) the full recall DETAIL — which digests,
// scores — reusing the assembly-preview read (`chat.previewAssembly`, the same host-gated source the Preview
// tab's Diagnostics render). CAVEAT: that read is the CURRENT-CONFIG dry run, not a byte-exact replay of the
// last turn's slice (the live per-turn slice is host-only observability that never rides the room bus — #313
// arm A, owner-approved); the count in the header IS the real turn's surfaced count.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { BrainCircuit, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { viewerTimeZone } from "#lib";
import type { RecallState } from "#state";
import { useRecallState } from "#state";
import { useSetMemoryEnabled, useStartMemoryBackfill } from "../hooks/use-memory-mutations.ts";
import { MemoryOnConfirm } from "./memory-on-confirm.tsx";
import { MemoryRecallDetail } from "./memory-recall-detail.tsx";

export interface ChatRecallIndicatorProps {
  readonly chatId: ChatId;
  /** The viewer holds the room HOST role (`ChatDetail.viewerIsHost`) — gates the popover's full recall detail
   *  (the `previewAssembly` read is `requireHost` server-side; a member sees the count summary only). */
  readonly viewerIsHost: boolean;
}

/** The accessible name for each recall state — the state lives in the NAME (the visible count is `aria-hidden`),
 *  so a screen reader is the equal of the eye. Stable "Memory" prefix leads so a role+name lookup survives the
 *  value change (the roster-chip precedent, WCAG 2.5.3). */
function recallLabel(recall: RecallState | null): string {
  if (recall === null) {
    return "Memory — idle";
  }
  if (recall.phase === "recalling") {
    return "Memory — recalling";
  }
  return `Memory — ${recall.count} recalled`;
}

/** The glyph tint per state: accent + a quiet pulse while recalling (motion-safe only — never a spin), full
 *  weight once memories are retrieved, and muted when idle (present but inactive, never implying a recall). */
function iconClass(recall: RecallState | null): string {
  if (recall?.phase === "recalling") {
    return "text-accent-fg motion-safe:animate-pulse";
  }
  return recall === null ? "opacity-60" : "";
}

/** Whether Memory is off for the host's account, and how to open the turn-on confirm. A member's chip carries none. */
interface MemoryDoor {
  readonly off: boolean;
  readonly onTurnOn: () => void;
}

const NO_MEMORY_DOOR: MemoryDoor = { off: false, onTurnOn: (): void => undefined };

/** The stable topbar memory slot — the brain glyph, its state carried in the accessible name + (when recalled)
 *  a count digit, click-opening the recall popover. Always rendered (a stable slot beside the members chip). */
export function ChatRecallIndicator(props: ChatRecallIndicatorProps): ReactElement {
  return props.viewerIsHost ? <HostRecallIndicator {...props} /> : <RecallIndicatorBody {...props} memory={NO_MEMORY_DOOR} />;
}

/** The host's chip: Memory is one switch on the account and only the host's account feeds the room, so only the
 *  host is offered it. The confirm lives here, outside the popover, so closing the popover cannot unmount it. */
function HostRecallIndicator(props: ChatRecallIndicatorProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetMemoryEnabled({ trpc, invalidation });
  const startBackfill = useStartMemoryBackfill({ trpc, invalidation });
  const [confirmingOn, setConfirmingOn] = useState(false);
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  return (
    <>
      <RecallIndicatorBody {...props} memory={{ off: settings?.config.memory.enabled === false, onTurnOn: (): void => setConfirmingOn(true) }} />
      <MemoryOnConfirm
        open={confirmingOn}
        onOpenChange={setConfirmingOn}
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

function RecallIndicatorBody({ chatId, viewerIsHost, memory }: ChatRecallIndicatorProps & { readonly memory: MemoryDoor }): ReactElement {
  const recall = useRecallState(chatId);
  const count = recall?.phase === "recalled" ? recall.count : null;
  const phase: RecallState["phase"] | "idle" = recall === null ? "idle" : recall.phase;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            // THE ACTIONABLE CHIP LIFTS ITS INK (#878 F12, side-eye 2026-08-30). Both bands' chip
            // rows had the grammar INVERTED: the pill shape marked the items you cannot click and the bare
            // ghost marked the one you can. MEASURED before choosing the axis — and the first attempt was
            // WRONG: `intent="outline"` looked like "an edge means pressable", but a `soft` Badge draws the
            // SAME 1px hairline (`bw:"1px"`, identical `borderTopColor` on all three chips), so the border
            // could never be the distinction. The FILL/INK pair is: an inert datum holds the muted step on
            // a tint, and the actionable chip lifts to the FOREGROUND on bare ground, with the hover/active
            // fill, the focus ring and the pointer cursor no datum has. Colour-as-liveness is the axis the
            // bracket already uses one slot up (the kicker's selection half, #102), so the pane teaches it
            // once. `shape="pill"` keeps the mock's ONE chip family.
            intent="secondary"
            shape="pill"
            size="sm"
            aria-label={recallLabel(recall)}
            // ITS OWN MARKER, not the roster chip's: the phone column sheds it (shell.css) on its own terms.
            // The coarse INLINE touch floor (#875 F6): at rest this chip is glyph-only, so its `sm` height
            // floor left it 40px wide against the 44px short side — the fragment's note carries the
            // measurement.
            className={`shell-chat-recall-chip whitespace-nowrap ${CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE}`}
            data-recall-phase={phase}
          >
            {/* The pulse is the ONLY motion, and only when recalling AND motion is allowed — a quiet breath,
                never a spin (owner ruling). Under prefers-reduced-motion it is a static labeled icon. */}
            <Icon icon={BrainCircuit} size="sm" className={iconClass(recall)} />
            {count === null ? null : (
              // The count is the visible label step, the same type as the roster chip's digit (never a mono value).
              <Text as="span" voice="label" className="shell-chat-chip-count text-inherit" aria-hidden={true}>
                {count}
              </Text>
            )}
          </Button>
        }
      />
      <PopoverPopup side="bottom" align="end">
        <Stack gap="block" className="min-w-56">
          <PopoverTitle>Memory recall</PopoverTitle>
          {memory.off ? <MemoryOffSummary onTurnOn={memory.onTurnOn} /> : <RecallSummary recall={recall} />}
          {viewerIsHost && recall !== null ? <RecallHostDetail chatId={chatId} /> : null}
        </Stack>
      </PopoverPopup>
    </Popover>
  );
}

/** Memory off: say so, and offer the switch behind the same cost confirm Settings uses. */
function MemoryOffSummary({ onTurnOn }: { readonly onTurnOn: () => void }): ReactElement {
  return (
    <Stack gap="field">
      <Text voice="gloss">Chat memory is off.</Text>
      <Button className="self-start" intent="secondary" onClick={onTurnOn} size="sm" type="button">
        Turn on
      </Button>
    </Stack>
  );
}

/** The always-present live summary — phase + count, honest for each state (never a bare "0"). */
function RecallSummary({ recall }: { readonly recall: RecallState | null }): ReactElement {
  if (recall === null) {
    return <Text voice="gloss">No memories recalled this turn.</Text>;
  }
  if (recall.phase === "recalling") {
    return <Text voice="gloss">Recalling memories… (embedding the query and scanning digests before the reply streams).</Text>;
  }
  if (recall.count === 0) {
    return <Text voice="gloss">Recall ran, but no stored memories were surfaced this turn.</Text>;
  }
  return <Text voice="gloss">{`Retrieved ${recall.count} ${recall.count === 1 ? "memory" : "memories"} for this turn.`}</Text>;
}

/** The HOST-only full recall detail — which digests, scores — from the assembly-preview read (the same
 *  host-gated source the Preview tab renders). Mounted only when the popover is open (base-ui lazily mounts
 *  popup children) and gated on host, so a member never fires the `requireHost` read. */
function RecallHostDetail({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data, isPending, isError } = useQuery(trpc.chat.previewAssembly.queryOptions({ chatId, timeZone: viewerTimeZone() }));
  if (isPending) {
    return <Text voice="gloss">Loading recall detail…</Text>;
  }
  if (isError) {
    return <Text voice="gloss">Couldn't load the recall detail.</Text>;
  }
  return (
    <Stack gap="row">
      <Text voice="gloss">Detail below is what recall does with the room's CURRENT config — not a byte-exact replay of this turn.</Text>
      <MemoryRecallDetail recall={data.trace.memoryRecall} />
    </Stack>
  );
}
