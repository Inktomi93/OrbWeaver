// The VEILED ledger (the deception `<lie>`/`<ofilter>` host surface):
// Status hosts the standing-secrets ledger because secrets are game-state ABOUT the participants (the same lens
// this tab already is). All crown-gold so "host-only" reads without a label. LIVE off `rpg.revealHidden`
// (the P3 read — host-gated server-side, leak-free NOT_FOUND for a member): the `standingLies` inventory
// (most-recent lie per character/truth across the visible transcript) → claim/truth/origin rows; the
// TurnRef (`messageId`) anchors where it was told. A member NEVER mounts this (the host gate + PERMISSION-
// omit: the section is only rendered for `isHost`), so member DOM carries zero veiled content.
//
// Its own QueryBoundary: a host game with no hidden content shows NOTHING (the honest empty plane — the
// ledger returns null on zero lies), and a failed reveal read surfaces the sealed battery
// (`QueryErrorState` + Retry) contained to this section, never breaking the participants above it.

import type { ChatId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { Kicker } from "./rpg-kicker.tsx";
import { RpgTurnRef } from "./rpg-turn-ref.tsx";

/** The reveal read + the crown-gold ledger rows. Suspends on `rpg.revealHidden`; empty ⇒ null. */
function VeiledLedger({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const { data: reveal } = useSuspenseQuery(trpc.rpg.revealHidden.queryOptions({ chatId }));

  // Flatten the per-character grouping into the standing-lie rows (each carries its own character label).
  const lies = reveal.standingLies.flatMap((group) => group.lies);
  if (lies.length === 0) {
    return null;
  }
  return (
    <Stack gap="field" data-slot="rpg-veiled-section">
      <Kicker crown={true}>Veiled — host only</Kicker>
      {lies.map((lie) => (
        <Stack key={`${lie.character}:${lie.truth}:${lie.messageId}`} gap="field" className="rounded-base border border-highlight bg-card px-block py-row">
          <Row gap="field" align="baseline" justify="between">
            <Text as="span" voice="label">
              {lie.character}
            </Text>
            <RpgTurnRef messageId={lie.messageId} />
          </Row>
          {/* The claim the character makes to the table (the lie's public face); `type` is the lie class. */}
          {lie.reason === "" ? null : <Text voice="label">{lie.reason}</Text>}
          {/* The TRUTH — crown-gold, host-only. */}
          <Text voice="gloss" className="text-accolade">
            truth: {lie.truth}
          </Text>
          {lie.type === "" ? null : <Text voice="gloss">{lie.type}</Text>}
        </Stack>
      ))}
    </Stack>
  );
}

export interface RpgVeiledSectionProps {
  readonly chatId: ChatId;
}

/** The host-only Veiled ledger — its own boundary so a failed reveal read is contained (it never breaks
 *  the participants above it). A read error surfaces the sealed battery (`QueryErrorState` with a real Retry) —
 *  this is game-state the host asked for, so an honest "couldn't load" beats a silent disappearance. Only
 *  rendered for a host (the caller gates on `isHost`; the verb is a second, server-side host gate). */
export function RpgVeiledSection({ chatId }: RpgVeiledSectionProps): ReactElement {
  return (
    // RESERVED (#1098) — the purest case in the sweep, and the `rpg-hud-band` precedent: with
    // `fallback={null}` this section is literally ABSENT while the reveal read is in flight, so the
    // participants above it and everything below shift by the ledger's whole height when it lands. The
    // remembered box holds that space open; nothing is painted into it, which is the point.
    <QueryBoundary
      fallback={null}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the veiled ledger" onRetry={retry} />}
      reserveKey="rpg.veiledLedger"
    >
      <VeiledLedger chatId={chatId} />
    </QueryBoundary>
  );
}
