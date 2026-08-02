// RAWVIEW — the per-variant WIRE INSPECTOR: the prompt THIS reply's shown swipe actually sent, read back off
// `message_variants.promptSnapshot` (`chat.getVariantWire`). The RETROSPECTIVE twin of the CONTEXT panel's
// Preview tab: Preview renders what the NEXT turn will send, this replays what a PAST turn did — the answer
// to "why did it say that" when the room's preset/roster has since moved on.
//
// WHY IT LIVES ON THE MESSAGE ROW, NOT IN THE PREVIEW TAB (the graft receipt): the Preview tab
// (`chats-section.tsx` → `AssemblyPreviewPanel`) is the chat's host-only diagnostic home, but its plane is
// CHAT-level and PROSPECTIVE, and `ChatContextState` carries no message/variant selection — it structurally
// cannot scope a per-VARIANT read. The per-variant diagnostic home that DOES exist is the message metadata
// row (`MessageMetadataRow`: the shown swipe's model/tokens/gen-window/cost), whose `MessageCostReadout` is
// exactly this pattern — a quiet click-to-reveal trigger whose query fires only on the click. This is an arm
// of that row, not a new surface.
//
// HOST-ONLY, TWO BELTS. The server verb is `requireHost` (matrix `getVariantWire: "host"`) because a stored
// assembled prompt carries the roster's cards at FULL fidelity (the D22 `memberCardVisibility` bypass), the
// hidden-class spans the §3.6 member strip removes (the wire projection rides them verbatim — the model
// always sees them), and the whole assembled history, including slots below a clamped member's D16 floor.
// The client belt is the trigger's own `host` gate: a member never renders it, so they never fire a read that
// would refuse — the affordance itself doesn't advertise a plane they can't have. The server gate is the
// AUTHORITY; this one is UX (never the reverse).
//
// The read is GATED on `open` (`useQuery` `enabled`) — never eager per row — and immutable once committed
// (`staleTime: Infinity`): an edit mints a new variant and a swipe appends one, so a variant's stamped prompt
// never changes. A NOT_FOUND is a TYPED gone-arm (the `MemberCardViewer` precedent), never a swallowed catch:
// it is what a deleted message, or a foreign variantId, resolves to.

import type { VariantWireView } from "@orb/contracts/chat";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, ScrollText } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { LogLine } from "@orb/ui/log-viewer";
import { LogViewer } from "@orb/ui/log-viewer";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";

export interface VariantWireViewerProps {
  readonly chatId: ChatId;
  readonly variantId: MessageVariantId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The transport-mapped domain NOT_FOUND — a deleted slot, or a variant that is not this chat's (the
 *  `messages.chatId` belt). Discriminated by the code, never a bare catch (`MemberCardViewer` precedent). */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  return (error as { data?: { code?: string } }).data?.code === "NOT_FOUND";
}

/** Split a prompt half into `LogViewer` lines. An EMPTY half is a real answer ("this half was empty"), not a
 *  blank panel — the viewer says so rather than rendering nothing. */
function toLines(text: string): readonly LogLine[] {
  return text === "" ? ["(empty)"] : text.split("\n");
}

/** One labelled slab of the sent prompt. `LogViewer` carries the mono panel + its own copy affordance, so a
 *  host can lift the exact bytes out without a second control per section. */
function WireSection({ heading, gloss, text }: { readonly heading: string; readonly gloss: string; readonly text: string }): ReactElement {
  return (
    <Section heading={<Text voice="kicker">{heading}</Text>}>
      <Stack gap="field">
        <Text voice="gloss">{gloss}</Text>
        <LogViewer lines={toLines(text)} className="max-h-64" />
      </Stack>
    </Section>
  );
}

/** The in-history injections the turn spliced (`afterHistory`) — role + depth + the bytes, one line each.
 *  Renders nothing when the turn spliced none (an absent section, not an empty shell). */
function InjectionsSection({ prompt }: { readonly prompt: VariantWireView["prompt"] }): ReactElement | null {
  if (prompt === null || prompt.afterHistory.length === 0) {
    return null;
  }
  return (
    <Section heading={<Text voice="kicker">{`In-history injections (${prompt.afterHistory.length})`}</Text>}>
      <LogViewer lines={prompt.afterHistory.map((i) => `[${i.role} @ depth ${i.depth}] ${i.content}`)} className="max-h-40" />
    </Section>
  );
}

/** The resolved body: the two prompt halves + the injections + the recorded knobs. */
function WireBody({ wire }: { readonly wire: VariantWireView }): ReactElement {
  const { prompt, params } = wire;
  if (prompt === null) {
    return (
      <EmptyState
        icon={<Icon icon={ScrollText} size="lg" />}
        title="No prompt was captured for this reply"
        description="Only generated replies record the prompt they sent — a message you typed, an imported turn, or a seeded greeting never ran one. Raw provider bytes aren't stored at all; they live only in the dev wire-capture ring (WIRE_CAPTURE)."
      />
    );
  }
  return (
    <Stack gap="section">
      <Text voice="gloss">
        The exact bytes this reply was generated from — not a re-render. Host-only: it carries every member's content, the room's hidden spans, and each
        character's full card.
      </Text>
      <WireSection heading="Static prefix" gloss="The cache-stable half — system prose, cards, world info." text={prompt.static} />
      <WireSection heading="Dynamic suffix" gloss="The per-turn half — steering, game state, the turn's own instruction." text={prompt.dynamic} />
      <InjectionsSection prompt={prompt} />
      {prompt.sendHistory ? null : <Text voice="gloss">History was DISABLED for this turn — the model saw no transcript.</Text>}
      {params === null ? null : (
        <Section heading={<Text voice="kicker">Recorded generation settings</Text>}>
          <LogViewer lines={JSON.stringify(params, null, 2).split("\n")} className="max-h-40" />
        </Section>
      )}
    </Stack>
  );
}

export function VariantWireViewer({ chatId, variantId, open, onOpenChange }: VariantWireViewerProps): ReactElement {
  const trpc = useTRPC();
  const wire = useQuery({
    ...trpc.chat.getVariantWire.queryOptions({ chatId, variantId }, { staleTime: Number.POSITIVE_INFINITY }),
    // Gated: the key is built (and the server hit) ONLY while the dialog is open — never eager per row.
    enabled: open,
    // A variant that vanished (or was never ours) shouldn't retry a NOT_FOUND into a spinner.
    retry: (_count, error): boolean => !isNotFound(error),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup size="lg" data-testid={testId("variantWireViewer")}>
        <Stack gap="block" className="min-h-0">
          <DialogTitle>What this reply sent</DialogTitle>
          <WireDialogBody isError={wire.isError} error={wire.error} data={wire.data} onRetry={(): void => void wire.refetch()} />
          <Row justify="end" className="shrink-0">
            <DialogClose render={<Button intent="secondary">Close</Button>} />
          </Row>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

/** The three read arms — the TYPED gone-arm first (a NOT_FOUND is an answer, not a failure), then the
 *  transient error arm, then loading, then the body. */
function WireDialogBody({
  isError,
  error,
  data,
  onRetry,
}: {
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: VariantWireView | undefined;
  readonly onRetry: () => void;
}): ReactElement {
  if (isError && isNotFound(error)) {
    return (
      <EmptyState
        icon={<Icon icon={ScrollText} size="lg" />}
        title="This reply is gone"
        description="The message was deleted, so there's no wire record left to read."
      />
    );
  }
  if (isError) {
    return <QueryErrorState label="the wire record" onRetry={onRetry} />;
  }
  if (data === undefined) {
    return <SkeletonRows count={4} />;
  }
  return <WireBody wire={data} />;
}
