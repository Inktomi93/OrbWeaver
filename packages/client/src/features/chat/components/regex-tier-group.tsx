// ONE TIER GROUP of the room's Regex section — `Everywhere` · `From the preset · <name>` · `From <character>`
// (one per seat) · `This chat`, in RUN ORDER (`docs/design/mocks/regex-section/DESIGN.md` §3).
//
// A PLAIN `Section`, NOT A DISCLOSURE, and that is the v2 shape: the groups are already inside a closed-by-
// default disclosure, and a second layer of doors would put every lever behind two taps and hide the run
// order the section exists to show. The tier's own LEVER lives in the strip at the top of the body, not in
// this header — a `Switch` cannot live inside a `CollapsibleTrigger`, and more importantly the strip is what
// makes every lever visible before any scrolling.
//
// A TIER THAT IS OFF STILL LISTS ITS ROWS, at full contrast, with their ranks dropped and their row switches
// live: a host cannot switch back on what the panel stopped mentioning, and the row switch is the LIBRARY's
// flag, which the room's lever never gated. The header says `off here` beside the count, because a bare `0`
// reads as "this tier is empty" — a different fact with a different fix.
//
// THE ROOM'S OWN TIER IS THE ONLY ONE THIS SURFACE MAY POPULATE OR ORDER (§3, §5). `This chat` gets the drag
// order (`RegexScopeOrder`'s chat arm over `regex.applyScopeOrder`) and `Attach a script`; every other tier
// is read-only here and its membership is edited where it belongs — the preset's Regex tab, the character's
// facet, the library's global switch. A room gesture must never edit a preset or a card.
//
// ORDERING AND DEDUP MEET IN ONE PLACE, and the consequence is stated rather than hidden: the drag list is
// the tier's DRAWN rows, so a chat-tier row that is also attached at an EARLIER tier (and therefore drawn
// there, with a `+1` chip) is not in it. `applyScopeOrder`'s own posture covers that — ids the write does
// not name keep their relative tail (`verbs/attachments/apply-scope-order.ts`) — so such a row keeps its
// attachment and lands after the reordered ones. The alternative, drawing it twice, would break the dedup
// rule the section is built to make visible.

import type { RegexTierGroupView, RegexTierKey, RegexTierRowView } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { RegexScopeOrder } from "#components";
import { regexScriptTitle, rowQualifiers, timeLib } from "#lib";
import { regexRowAlsoAt, regexTierInForceCount, regexTierKicker, regexTierProvenance } from "../lib/regex-section-model.ts";
import { AddChatScriptDialog } from "./add-chat-script-dialog.tsx";
import { RegexTierRow } from "./regex-tier-row.tsx";

export interface RegexTierGroupProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
  readonly tier: RegexTierGroupView;
  /** The rows this group DRAWS — the tier's own rows minus the ones another tier is home to (the dedup). */
  readonly rows: readonly RegexTierRowView[];
  /** Every tier of this room, for the `+N` chip's naming. */
  readonly tiers: readonly RegexTierGroupView[];
  /** WHAT EACH TIER IS CALLED (`regexTierLabels`) — the wire label for the preset tier, the seat name for a
   *  character tier. Threaded rather than rebuilt here: the `+N` chip names OTHER tiers. */
  readonly labels: ReadonlyMap<RegexTierKey, string>;
  /** The viewer's own library ids — a chat-tier row outside this set was attached by a PREVIOUS host
   *  (#1739). Empty for a member, whose rows carry no controls to gate. */
  readonly ownedScriptIds: ReadonlySet<RegexScriptId>;
}

export function RegexTierGroup({ chatId, isHost, tier, rows, tiers, labels, ownedScriptIds }: RegexTierGroupProps): ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isRoomTier = tier.scope === "chat";
  const qualifiers = rowQualifiers(
    rows.map((row) => ({ name: regexScriptTitle(row.script), at: row.script.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );
  const renderRow = (script: RegexScriptRow, index: number): ReactElement => {
    const row = rows[index];
    if (row === undefined) {
      // Unreachable by construction (the order editor renders exactly the array it was handed); rendering
      // the bare name beats throwing inside a drag list.
      return <Text voice="gloss">{regexScriptTitle(script)}</Text>;
    }
    return (
      <RegexTierRow
        alsoAt={regexRowAlsoAt(tiers, row.script.id, tier.scope).map((scope) => regexTierKicker(scope, labels))}
        chatId={chatId}
        isHost={isHost}
        notYours={isRoomTier && !ownedScriptIds.has(row.script.id)}
        qualifier={qualifiers[index]}
        row={row}
        scope={tier.scope}
      />
    );
  };

  return (
    <Section
      data-slot="regex-tier"
      data-tier={tier.scope}
      kicker={<TierKicker allowed={tier.allowed} count={regexTierInForceCount(rows)} label={regexTierKicker(tier.scope, labels)} />}
    >
      {isHost ? <Text voice="gloss">{regexTierProvenance(tier.scope, labels)}</Text> : null}
      {rows.length === 0 ? (
        // Never render nothing — an empty tier is a normal state (a room with no preset, a card with no
        // scripts) and a blank block reads as a failed load.
        <Text voice="gloss">{emptyLine(tier.scope, isHost)}</Text>
      ) : (
        <TierRows chatId={chatId} isRoomTier={isRoomTier} isHost={isHost} renderRow={renderRow} rows={rows} />
      )}
      {isRoomTier && isHost ? (
        <>
          <Button className="self-start" intent="secondary" onClick={(): void => setPickerOpen(true)} size="sm" type="button">
            <Icon icon={Plus} size="sm" />
            Attach a script
          </Button>
          <AddChatScriptDialog attachedIds={tier.rows.map((row) => row.script.id)} chatId={chatId} onOpenChange={setPickerOpen} open={pickerOpen} />
        </>
      ) : null}
    </Section>
  );
}

/** The group's header: the tier's name, its post-dedup in-force count, and `off here` when the room switched
 *  it off. All three inside the `<h3>` the `kicker` slot spells, so the heading's accessible name carries
 *  the state a sighted reader gets from the chip. */
function TierKicker({ allowed, count, label }: { readonly allowed: boolean; readonly count: number; readonly label: string }): ReactElement {
  return (
    <>
      {label}{" "}
      <Badge intent="neutral" size="inline" tone="soft">
        {count}
      </Badge>
      {allowed ? null : (
        <>
          {" "}
          <Badge intent="neutral" size="inline" tone="soft">
            off here
          </Badge>
        </>
      )}
    </>
  );
}

/** The rows, ordered by the ROOM where the room owns the order and plainly otherwise.
 *
 *  `RegexScopeOrder` is the shipped order editor (drag + keyboard under the large-group cap, explicit
 *  Move up/down past it) and this is its first production mount for the chat scope — it shipped
 *  int-tested with zero client callers, which is exactly the "unwired ≠ worthless" case. */
function TierRows({
  chatId,
  isRoomTier,
  isHost,
  renderRow,
  rows,
}: {
  readonly chatId: ChatId;
  readonly isRoomTier: boolean;
  readonly isHost: boolean;
  readonly renderRow: (script: RegexScriptRow, index: number) => ReactElement;
  readonly rows: readonly RegexTierRowView[];
}): ReactElement {
  const scripts = rows.map((row) => row.script);
  if (isRoomTier && isHost) {
    return <RegexScopeOrder renderItem={renderRow} scope={{ kind: "chat", chatId }} scripts={scripts} />;
  }
  // LIST SEMANTICS on the read-only arms too: these are RANKED rows, and a rank that exists only as a
  // visual numeral tells a screen reader nothing about where the row sits (`RegexScopeOrder`'s own rule).
  return (
    <Stack gap="tight" role="list">
      {scripts.map((script, index) => (
        <Stack aria-posinset={index + 1} aria-setsize={scripts.length} key={script.id} role="listitem">
          {renderRow(script, index)}
        </Stack>
      ))}
    </Stack>
  );
}

/** What an empty tier says. The ROOM's own tier is the only one with an action attached to the emptiness,
 *  so it is the only one whose line names it. */
function emptyLine(scope: RegexTierKey, isHost: boolean): string {
  if (scope !== "chat") {
    return "Nothing from here.";
  }
  return isHost ? "No scripts are attached to this chat yet." : "No scripts are attached to this chat — only the host can attach one.";
}
