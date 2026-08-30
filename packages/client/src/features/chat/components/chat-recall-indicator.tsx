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
import { CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE } from "#components";
import { useTRPC } from "#data";
import type { RecallState } from "#state";
import { useRecallState } from "#state";
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

/** The stable topbar memory slot — the brain glyph, its state carried in the accessible name + (when recalled)
 *  a count digit, click-opening the recall popover. Always rendered (a stable slot beside the members chip). */
export function ChatRecallIndicator({ chatId, viewerIsHost }: ChatRecallIndicatorProps): ReactElement {
  const recall = useRecallState(chatId);
  const count = recall?.phase === "recalled" ? recall.count : null;
  const phase: RecallState["phase"] | "idle" = recall === null ? "idle" : recall.phase;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            intent="ghost"
            size="sm"
            aria-label={recallLabel(recall)}
            // ITS OWN SHED MARKER, not the roster chip's (#846, 2026-08-30). This control wore
            // `.shell-chat-member-chip` — a class named for a DIFFERENT chip — so its topbar budget was
            // inherited by accident and could not be reasoned about separately. It sheds at the same steps the
            // roster chip does (the 30rem phone column, and while the context pane whose band carries this
            // same indicator is docked), but the two now say so for their own reasons.
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
              // `datum`, not `gloss` (#875 F6): this digit is the visible label of a button, and `gloss` is
              // the 10.5px micro step — under the 11px readable floor. `datum` is the VALUE voice at the
              // 13px label step, which is what this digit is.
              <Text as="span" voice="datum" aria-hidden={true}>
                {count}
              </Text>
            )}
          </Button>
        }
      />
      <PopoverPopup side="bottom" align="end">
        <Stack gap="block" className="min-w-56">
          <PopoverTitle>Memory recall</PopoverTitle>
          <RecallSummary recall={recall} />
          {viewerIsHost && recall !== null ? <RecallHostDetail chatId={chatId} /> : null}
        </Stack>
      </PopoverPopup>
    </Popover>
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
  const { data, isPending, isError } = useQuery(trpc.chat.previewAssembly.queryOptions({ chatId }));
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
