// The room's REGEX section — "what regex runs here, in run order, and every lever that changes it"
// (owner-approved 2026-09-05 on canvas v2, #1742).
//
// THE PROBLEM IT EXISTS FOR (owner, 2026-09-05): "why is my chat weird → turn the various regex on and off →
// think of all the places you have to go". Before this section a host bisecting a room walked four surfaces
// (the library, the preset's Regex tab, each character's facet, nothing at all for the room's own tier) and
// every switch they found was GLOBAL — flipping one to test this room changed every other room too.
//
// TWO KINDS OF SWITCH, AND THEY MEAN DIFFERENT THINGS. A TIER switch means HERE (`chat.setRegexAllow` — a
// per-chat flag; the preset's scripts stop running in this room and nowhere else). A ROW switch means
// EVERYWHERE (`regex.updateScript {enabled}` — the library row's own flag, SillyTavern's semantics). The row
// says so in its accessible name (`<name> — everywhere`) and a flip that reaches beyond this chat raises a
// toast with Undo. That distinction is the whole design; if you are tempted to "simplify" the two into one
// control, read §1 and §5 of the design first — a per-chat MUTE of an inherited script was considered and
// refused (a second meaning of "off" on one row).
//
// THE BODY IS THE SERVER'S ANSWER, NOT A CLIENT UNION (§7.1). `chat.listEffectiveRegex` returns the per-tier
// listing AND the effective run order from the SAME pure resolver the turn uses
// (`domain/chat/substrate/regex-tier.ts`), so a rank drawn here is the rank the next reply will apply. The
// client's only rendering decision is WHERE a doubly-attached row draws (`lib/regex-section-model.ts`).
//
// TWO LEGS, TWO ROSTERS (§3 (b)). The tier groups list PROMPT participation — the only leg the tier levers
// and the master reach. The display leg is ATTACHMENT-BLIND by the 2026-08-02 O-4 ruling (the viewer's whole
// library ∩ DISPLAY, plus the host's broadcast — `data/use-display-scripts.ts`), so no lever here can touch
// it and it must not appear to: `On screen` is its own roster at the foot, with its own switches, and it is
// where `Host controls › Appearance` moved to (that disclosure retired with this section — a regex control
// under an appearance name).
//
// MEMBER VIEW (D19). The union resolves under the host's frozen `runAsUserId`, so the effective read is
// host-gated and a member reads the room's own tier through `regex.listForChat` (member-gated, room-public).
// A member gets the rows and NO controls — the §8.1 permission-OMIT at row level, the Lorebooks rack's
// shape — plus one line saying whose regex this is. Nothing about the host's library leaks.

import type { RegexTierGroupView, RegexTierKey } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, ChatId, RegexScriptId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useInvalidation, useTRPC } from "#data";
import { REGEX_PLACEMENT_GLYPHS, REGEX_PLACEMENT_LABELS } from "#lib";
import { useSetRegexAllow } from "../hooks/use-chat-regex-mutations.ts";
import { regexRowHomes, regexTierLabels, regexTierLever, regexTierLeverCount, regexTierRows } from "../lib/regex-section-model.ts";
import { RegexOnScreenGroup } from "./regex-on-screen-group.tsx";
import { RegexTierGroup } from "./regex-tier-group.tsx";

/** The six pipeline stages, in the order the pipeline runs them — the legend's own source, and the same
 *  `RegexPlacement` axis the row glyphs key on (`#lib`'s one home). */
const STAGE_LEGEND = Object.keys(REGEX_PLACEMENT_LABELS) as (keyof typeof REGEX_PLACEMENT_LABELS)[];

export interface RegexSectionProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
}

/** The section's KICKER chip — the count of scripts in force after dedup, or the word `off` when the room's
 *  master is off (§7.4: a bare count hides the master state, and "0" and "off" are different facts).
 *
 *  `size="inline"` and the neutral soft tone are `HeadingWithCount`'s (#829): the `sm` arm is `inline-flex`
 *  with its own type axes and more than doubles a kicker's line box when the count lands. This chip cannot
 *  BE `HeadingWithCount` — that helper renders nothing at 0 and takes a number, where an `off` room must say
 *  so at any count. */
export function RegexHeading({ chatId, isHost }: RegexSectionProps): ReactNode {
  return isHost ? <HostRegexHeading chatId={chatId} /> : <MemberRegexHeading chatId={chatId} />;
}

function RegexKicker({ chip }: { readonly chip: string | null }): ReactNode {
  return (
    <>
      Regex
      {chip === null ? null : (
        <>
          {" "}
          <Badge intent="neutral" size="inline" tone="soft">
            {chip}
          </Badge>
        </>
      )}
    </>
  );
}

/** The host's chip, on the non-suspending shared-cache idiom every count chip in this tab uses: the same
 *  query the body suspends on, so one fetch serves both and the chip paints as soon as it lands. */
function HostRegexHeading({ chatId }: { readonly chatId: ChatId }): ReactNode {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.listEffectiveRegex.queryOptions({ chatId }));
  if (data === undefined) {
    return <RegexKicker chip={null} />;
  }
  return <RegexKicker chip={data.enabled ? countChip(data.effective.length) : "off"} />;
}

/** A member's chip counts only the rows that could run — the room's own tier, enabled. It cannot say `off`:
 *  the master is the host's flag and is not on the member's read, so the honest member chip is a count of
 *  what this room carries (see the member line in the body, which says whose regex this is). */
function MemberRegexHeading({ chatId }: { readonly chatId: ChatId }): ReactNode {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.regex.listForChat.queryOptions({ chatId }));
  return <RegexKicker chip={countChip((data ?? []).filter((script) => script.enabled).length)} />;
}

/** A zero count spends no chip (the `HeadingWithCount` rule — a "0" chip is noise). */
function countChip(count: number): string | null {
  return count === 0 ? null : String(count);
}

/** The section body. */
export function RegexSection({ chatId, isHost }: RegexSectionProps): ReactElement {
  return isHost ? <HostRegexBody chatId={chatId} /> : <MemberRegexBody chatId={chatId} />;
}

function HostRegexBody({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: view } = useSuspenseQuery(trpc.chat.listEffectiveRegex.queryOptions({ chatId }));
  // The seat names the tier labels use. `getChat` is already loaded for this tab (three sibling sections
  // read it), and the lookup is by the tier key's OWN character id — an exact seat match, never a
  // re-derivation of which characters the turn seats (that decision is the read's).
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  // The viewer's own library ids — the #1739 "previous host" test on the room's own tier (a chat-tier row
  // outside the host's library was attached by someone who is no longer here). Shared cache entry with the
  // `On screen` roster below, so it costs no second request.
  const { data: owned } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  // WHAT EACH TIER IS CALLED: the wire's server-resolved name for the preset tier (#1754 — the client cannot
  // know it; the viewer's own active preset is a DIFFERENT preset on a GM-redirect room), the roster's seat
  // names for the character tiers (an exact match on the id their own key carries).
  const labels = regexTierLabels(
    view.tiers,
    new Map<CharacterId, string>(
      chat.participants.flatMap((participant) => (participant.characterId === null ? [] : [[participant.characterId, participant.displayName] as const])),
    ),
  );
  const homes = regexRowHomes(view.tiers);
  return (
    <Stack data-slot="regex-section" gap="block">
      {/* The two facts a debugger must know before touching anything, in the canvas's own words. */}
      <Text voice="gloss">
        Prompt rules apply from the next reply; the switches below say <b>where they run here</b>. A row’s own switch is the script’s — <b>off everywhere</b>.
        What you see on screen is the last group.
      </Text>
      <RegexLeverStrip chatId={chatId} enabled={view.enabled} homes={homes} labels={labels} tiers={view.tiers} />
      <StageLegend />
      {view.tiers.map((tier) => (
        <RegexTierGroup
          chatId={chatId}
          // #1755 — the room's whole run length: the SET each row's rank is a position in. The host's read
          // is the only one that carries it, which is why the member's arm below passes null.
          effectiveCount={view.effective.length}
          isHost={true}
          key={tier.scope}
          labels={labels}
          ownedScriptIds={new Set(owned.map((script) => script.id))}
          rows={regexTierRows(tier, homes)}
          tier={tier}
          tiers={view.tiers}
        />
      ))}
      <RegexOnScreenGroup chatId={chatId} isHost={true} />
    </Stack>
  );
}

function MemberRegexBody({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listForChat.queryOptions({ chatId }));
  const tier = memberChatTier(scripts);
  return (
    <Stack data-slot="regex-section" gap="block">
      <Text voice="gloss">The host’s regex applies to this room. Only the host can change it.</Text>
      <RegexTierGroup
        chatId={chatId}
        // NULL, not 0: a member's read carries no run order at all (every `runsAt` is null for the reason
        // `memberChatTier` states), so there is no set for a rank to be a position in — and a `0` would be
        // a count claiming the room runs nothing.
        effectiveCount={null}
        isHost={false}
        labels={new Map<RegexTierKey, string>()}
        ownedScriptIds={new Set<RegexScriptId>()}
        rows={tier.rows}
        tier={tier}
        tiers={[tier]}
      />
      <RegexOnScreenGroup chatId={chatId} isHost={false} />
    </Stack>
  );
}

/** The member's room tier as the ONE group shape the tier renderer takes — so a member's rows are the same
 *  rows, drawn by the same component, with the controls simply absent (`no-separate-reduced-modes`).
 *
 *  `runsAt` is NULL on every row, and that is the honest answer rather than a shortcut: a rank is a position
 *  in the room's WHOLE run order, which includes three tiers of the host's library a member may not see. The
 *  member's rows therefore draw no numeral at all (not a `—`, which would claim the row does not run).
 *  `allowed` is `true` because the member's read carries no per-tier flag — the group says nothing about a
 *  lever the reader has no access to, and the line above it says whose regex this is. */
function memberChatTier(scripts: readonly RegexScriptRow[]): RegexTierGroupView {
  return {
    scope: "chat",
    allowed: true,
    rows: scripts.map((script, position) => ({ script, position, runsAt: null, attachedElsewhere: false })),
  };
}

/** The one-line stage legend — the six placement glyphs named once, so the row strips are readable. */
function StageLegend(): ReactElement {
  return (
    <Row className="flex-wrap" gap="field">
      {STAGE_LEGEND.map((placement) => (
        <Row align="center" gap="tight" key={placement}>
          <Icon icon={REGEX_PLACEMENT_GLYPHS[placement]} size="xs" />
          <Text voice="gloss">{REGEX_PLACEMENT_LABELS[placement].toLowerCase()}</Text>
        </Row>
      ))}
    </Row>
  );
}

/**
 * THE LEVER STRIP — the first thing in the body, and the v2 change the reviews minted (§3 (a)): the master
 * plus ONE switch per tier, `Everywhere` included, so every lever is one tap away regardless of how far the
 * tier lists scroll. (v1 put the last tier's switch in its group header, 856px down a 762px pane.)
 *
 * A `Switch` cannot live inside the disclosure's `CollapsibleTrigger` — that is a button — so the strip is
 * what makes the master reachable at all without a second door.
 *
 * WITH THE MASTER OFF the tier switches are `disabled` (Base UI renders the non-native button's disabled
 * state as `aria-disabled`, so they stay in the reading order and announce their state) — their flag is
 * still stored and still shown; nothing in this room runs until the master is back on. The ROWS stay live:
 * a row switch is the library's flag and reaches every other room, which the master never gated.
 */
function RegexLeverStrip({
  chatId,
  enabled,
  homes,
  labels,
  tiers,
}: {
  readonly chatId: ChatId;
  readonly enabled: boolean;
  readonly homes: ReadonlyMap<RegexScriptRow["id"], RegexTierGroupView["scope"]>;
  readonly labels: ReadonlyMap<RegexTierKey, string>;
  readonly tiers: readonly RegexTierGroupView[];
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setAllow = useSetRegexAllow({ trpc, invalidation });
  return (
    <Stack data-slot="regex-levers" gap="tight">
      <Row align="center" gap="field" justify="between">
        <Text as="span" voice="label">
          Run regex in this chat
        </Text>
        <Switch
          aria-label="Run regex in this chat"
          checked={enabled}
          onCheckedChange={(next): void => {
            setAllow.mutate({ chatId, lever: { kind: "master", enabled: next } });
          }}
        />
      </Row>
      {tiers.map((tier) => {
        const label = regexTierLever(tier.scope, labels);
        const rows = regexTierRows(tier, homes);
        return (
          <Row align="center" gap="field" justify="between" key={tier.scope}>
            <Row align="baseline" className="min-w-0" gap="tight">
              <Text as="span" className="truncate" voice="label">
                {label}
              </Text>
              <Badge intent="neutral" size="inline" tone="soft">
                {regexTierLeverCount(rows)}
              </Badge>
            </Row>
            {/* The name carries the SCOPE, because the switch's meaning is exactly what its neighbours'
                is not: this one is per-room ("— in this chat"), a row's is per-library ("— everywhere").
                It CONTAINS the visible label, so voice control still works (WCAG 2.5.3). */}
            <Switch
              aria-label={`${label} — in this chat`}
              checked={tier.allowed}
              disabled={!enabled}
              onCheckedChange={(next): void => {
                setAllow.mutate({ chatId, lever: { kind: "tier", tier: tier.scope, enabled: next } });
              }}
            />
          </Row>
        );
      })}
    </Stack>
  );
}
