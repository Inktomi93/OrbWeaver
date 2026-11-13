// The VEILED ledger (the deception `<lie>`/`<ofilter>` host surface):
// Status hosts the standing-secrets ledger because secrets are game-state ABOUT the participants (the same lens
// this tab already is). All crown-gold so "host-only" reads without a label. LIVE off `rpg.revealHidden`
// (the P3 read — host-gated server-side: FORBIDDEN for a joined member, NOT_FOUND for a non-member): the `standingLies` inventory
// (most-recent lie per character/truth across the visible transcript) → motive/truth/origin rows; the
// TurnRef (the message's time) anchors where it was told. The `messages` log below them lists every hidden span.
// A member NEVER mounts this (the host gate + PERMISSION-omit: the section is only rendered for `isHost`), so
// member DOM carries zero veiled content.
//
// Its own QueryBoundary: a host game with no hidden content shows NOTHING (the honest empty plane — the
// ledger returns null on zero messages), and a failed reveal read surfaces the sealed battery
// (`QueryErrorState` + Retry) contained to this section, never breaking the participants above it.
//
// EACH LIE'S MOTIVE (`reason`, "why they lie") AND TRUTH SIT BEHIND A RevealGate, so a host on a shared screen or
// a stream does not spoil them at rest: both are unmounted until the host reveals them and unmounted again on Hide.
// Field values wrap anywhere, so one unbroken token never widens the gate past its row. This is presentation
// only. The host gate above and the server's host check on `rpg.revealHidden` are the authorization.

import type { RpgRevealedSpan, RpgRevealView, RpgStandingLie } from "@orb/contracts/rpg";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { RevealGate } from "@orb/ui/reveal-gate";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useSuspenseQuery, useTRPC } from "#data";
import { veiledReasonLine, veiledTruthLine } from "../lib/rpg-names.ts";
import { Kicker } from "./rpg-kicker.tsx";
import { RpgTurnRef } from "./rpg-turn-ref.tsx";

/** The gate's accessible subject: the character, plus the lie's place among theirs when they hold several, so
 *  every Reveal on the ledger has its own name without speaking the truth it hides. */
function truthSubject(character: string, index: number, count: number): string {
  return count > 1 ? `the truth for ${character}, ${index + 1} of ${count}` : `the truth for ${character}`;
}

/** One hidden span as a log row. An attr-less or over-cap span has no readable field, so it has nothing to gate. */
function HiddenLogRow({
  span,
  messageId,
  createdAt,
  subject,
}: {
  readonly span: RpgRevealedSpan;
  readonly messageId: MessageId;
  readonly createdAt: number;
  readonly subject: string;
}): ReactElement {
  const fields = span.fields.filter((field) => field.value !== "");
  return (
    <Card tone="warning" variant="outline">
      <Stack gap="field" data-slot="rpg-veiled-log-row">
        <Row gap="field" align="baseline" justify="between">
          <Text as="span" voice="label">
            {span.revealLabel}
          </Text>
          <RpgTurnRef messageId={messageId} createdAt={createdAt} />
        </Row>
        {fields.length === 0 ? (
          <Text voice="gloss" data-slot="rpg-veiled-log-unreadable">
            Nothing readable here. The model still remembers it.
          </Text>
        ) : (
          <RevealGate subject={subject}>
            <Stack gap="field">
              {fields.map((field) => (
                <Text key={field.key} voice="gloss" ink="accolade" className="min-inline-0" wrap="anywhere">
                  {field.key}: {field.value}
                </Text>
              ))}
            </Stack>
          </RevealGate>
        )}
      </Stack>
    </Card>
  );
}

/** Every hidden span by turn, newest first. The ledger above keeps only standing lies, so an `<ofilter>`, a
 *  retold lie's earlier telling and an unreadable span live here. Closed at rest because a long game holds many. */
function HiddenLog({ messages }: { readonly messages: RpgRevealView["messages"] }): ReactElement {
  const rows = messages
    .toReversed()
    .flatMap(({ messageId, createdAt, spans }) => spans.map((span, index) => ({ key: `${messageId}:${index}`, messageId, createdAt, span })));
  return (
    <Collapsible data-slot="rpg-veiled-log">
      <CollapsibleTrigger>Every hidden line ({rows.length})</CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="field">
          {rows.map(({ key, messageId, createdAt, span }, index) => (
            <HiddenLogRow key={key} span={span} messageId={messageId} createdAt={createdAt} subject={`hidden line ${index + 1} of ${rows.length}`} />
          ))}
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** The reveal read + the crown-gold ledger rows and the hidden log. Suspends on `rpg.revealHidden`; empty ⇒ null. */
function VeiledLedger({ chatId }: { readonly chatId: ChatId }): ReactElement | null {
  const trpc = useTRPC();
  const { data: reveal } = useSuspenseQuery(trpc.rpg.revealHidden.queryOptions({ chatId }));

  // Flatten the per-character grouping into the standing-lie rows, keeping each lie's place in its group.
  const lies: { readonly lie: RpgStandingLie; readonly subject: string }[] = reveal.standingLies.flatMap((group) =>
    group.lies.map((lie, index) => ({ lie, subject: truthSubject(lie.character, index, group.lies.length) })),
  );
  if (reveal.messages.length === 0) {
    return null;
  }
  const toldAt = new Map(reveal.messages.map((message) => [message.messageId, message.createdAt]));
  return (
    <Stack gap="field" data-slot="rpg-veiled-section">
      <Kicker crown={true} gloss="Host only">
        Veiled
      </Kicker>
      {/* The row key is the lie's identity, so a revealed truth stays revealed while other rows come and go,
          and a changed truth is a new row that starts hidden. */}
      {lies.map(({ lie, subject }) => (
        <Card tone="warning" variant="outline" key={`${lie.character}:${lie.truth}:${lie.messageId}`}>
          <Stack key={`${lie.character}:${lie.truth}:${lie.messageId}`} gap="field">
            <Row gap="field" align="baseline" justify="between">
              <Text as="span" voice="label">
                {lie.character}
              </Text>
              <RpgTurnRef messageId={lie.messageId} createdAt={toldAt.get(lie.messageId)} />
            </Row>
            {/* The MOTIVE and the TRUTH — crown-gold, host-only, and unmounted until the host reveals them; `type` is the lie class. */}
            <RevealGate subject={subject}>
              <Stack gap="field">
                {lie.reason === "" ? null : (
                  <Text voice="gloss" ink="accolade" className="min-inline-0" wrap="anywhere">
                    {veiledReasonLine(lie.reason)}
                  </Text>
                )}
                <Text voice="gloss" ink="accolade" className="min-inline-0" wrap="anywhere">
                  {veiledTruthLine(lie.truth)}
                </Text>
              </Stack>
            </RevealGate>
            {lie.type === "" ? null : <Text voice="gloss">{lie.type}</Text>}
          </Stack>
        </Card>
      ))}
      <HiddenLog messages={reveal.messages} />
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
      resetKeys={[chatId]}
      fallback={null}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the veiled ledger" onRetry={retry} />}
      reserveKey="rpg.veiledLedger"
    >
      <VeiledLedger chatId={chatId} />
    </QueryBoundary>
  );
}
