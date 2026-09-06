// ONE ROW of the room's Regex section — a script, where it bites, whether it runs here, and the two
// controls the room is allowed to point at it (`docs/design/mocks/regex-section/DESIGN.md` §3, the row).
//
// THE ANATOMY, left to right: the RANK (only while it runs) · the stage glyphs + the name · the pattern ·
// the row's own switch · the `⋯`. Each of those is a decision, not a layout:
//
//   • THE RANK IS THE SERVER'S (`runsAt`). An off row shows `—` and never a numeral — a rank on a row that
//     does not run is the exact lie the section exists to remove (§3 (c)).
//   • THE SWITCH IS THE LIBRARY'S `enabled`, i.e. OFF EVERYWHERE, and its accessible name says so
//     (`<name> — everywhere`) beside a tier switch whose name says `— in this chat`. Two switches, two
//     scopes, on one screen: the names are what keep them apart for a screen reader, and the toast is what
//     keeps them apart for everyone else.
//   • THE TOAST IS RAISED WHEN THE FLIP REACHES BEYOND THIS ROOM, which is every tier except a chat-tier row
//     attached NOWHERE else (`attachedElsewhere === false`). That is the canvas's own rule
//     (`build.mjs`: `const local = s.tier === "chat" && s.elsewhere === false`) and the reason it is not
//     simply `attachedElsewhere`: a GLOBAL-tier row attached at exactly one tier has
//     `attachedElsewhere === false` and still reaches every room in the box, so keying the warning on that
//     flag alone would stay silent for the widest-reaching flip on the panel.
//   • OFF ROWS KEEP FULL CONTRAST (§3 (c)) — the state is a MARK (`OFF`), never a dim. Stacking opacity on a
//     row whose tier may also be off produced two indistinguishable greys for two different facts.
//   • A ROW THE HOST DOES NOT OWN (#1739 — a previous host's chat-tier attachment) draws the mark, no
//     switch, and a menu that offers exactly ONE action: `Detach from this chat`. The client learns the
//     row is foreign by SUBTRACTION: `regex.listScripts` is the viewer's whole library, so a chat-tier row
//     that is not in it belongs to someone else. The SPLIT is the point — `detachFromChat` gates on the
//     ROOM (D18) and never re-checks the script's owner, so the sitting host can always evict it; `enabled`
//     is the LIBRARY row's and stays owner-gated, so the switch would be an affordance lie and is omitted.
//     (The verb dropped its ownership re-check with the handoff fix; a menu that still refused the detach
//     would be stating a rule the server no longer has.)

import type { RegexTierKey, RegexTierRowView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { BookOpen, Icon, Unlink } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { RowActionsMenu } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify, REGEX_PLACEMENT_GLYPHS, REGEX_PLACEMENT_LABELS, regexPlacementStages, regexScriptTitle, rowActionSubject } from "#lib";
import { openConfigTo, selectCollectionMember } from "#state";
import { useDetachScriptFromChat, useSetRegexScriptEnabled } from "../hooks/use-chat-regex-mutations.ts";

/** The config group the script library lives in — the `⋯ → Open in library` destination (#1725). */
const REGEX_COLLECTION = "regex";

/** What an unranked row draws where the numeral goes. An EM DASH, never a blank: the column stays a column,
 *  and "this one does not run" is a statement rather than an absence. */
const NO_RANK = "—";

export interface RegexTierRowProps {
  readonly chatId: ChatId;
  readonly row: RegexTierRowView;
  /** The OTHER tiers of this room holding the same script — the `+N` chip and its naming. Empty ⇒ no chip. */
  readonly alsoAt: readonly string[];
  /** The row's own tier — decides the detach item and half of the toast rule above. */
  readonly scope: RegexTierKey;
  /** A member renders the identical row with every control OMITTED (§8.1 permission-OMIT at row level). */
  readonly isHost: boolean;
  /** #1739 — a chat-tier row the viewer's library does not hold. */
  readonly notYours: boolean;
  /** The disambiguator this row's action names carry when two rows share a name + stamp (`rowQualifiers`). */
  readonly qualifier: string | undefined;
  /** #1755 — how many rows run in this room at all (`listEffectiveRegex`'s `effective.length`), the `m` of
   *  the spoken `Runs <n> of <m>`. NULL for a viewer whose read carries no run order (a member), which is
   *  the same condition that makes every `runsAt` null. */
  readonly effectiveCount: number | null;
}

export function RegexTierRow({ chatId, row, alsoAt, scope, isHost, notYours, qualifier, effectiveCount }: RegexTierRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetRegexScriptEnabled({ trpc, invalidation });
  const detach = useDetachScriptFromChat({ trpc, invalidation });
  const { script } = row;
  const name = regexScriptTitle(script);
  const subject = rowActionSubject(name, qualifier);

  const flip = (next: boolean): void => {
    setEnabled.mutate({ scriptId: script.id, input: { enabled: next } });
    if (scope === "chat" && !row.attachedElsewhere) {
      // Attached HERE and nowhere else: the flip cannot reach another room, so there is nothing to warn about.
      return;
    }
    notify.info({
      title: `Turned ${name} ${next ? "on" : "off"} everywhere`,
      description: next
        ? "It runs again in every chat, preset and character that attaches it."
        : "It stops running in every chat, preset and character that attaches it — not just this room.",
      action: {
        label: "Undo",
        onClick: (): void => {
          setEnabled.mutate({ scriptId: script.id, input: { enabled: !next } });
        },
      },
    });
  };

  const menu = <RowActions chatId={chatId} detach={detach} name={subject} notYours={notYours} scope={scope} scriptId={script.id} />;
  return (
    <ListRow
      {...(isHost
        ? {
            // The controls are SIBLINGS of the row body (never nested inside it) — the ListRow contract. The
            // body is not clickable: the row's door is the `⋯`, because "open the library" navigates away
            // from the room and must be chosen, not stumbled into.
            actions: (
              <Row align="center" gap="tight">
                {notYours ? null : <Switch aria-label={`${name} — everywhere`} checked={script.enabled} onCheckedChange={flip} tone="quiet" />}
                {menu}
              </Row>
            ),
          }
        : {})}
      leading={
        <Text as="span" className="tabular-nums" voice="quiet">
          {rankLabel(row.runsAt, isHost)}
        </Text>
      }
      markers={<RowMarkers alsoAt={alsoAt} enabled={script.enabled} notYours={notYours} runsAt={row.runsAt} effectiveCount={effectiveCount} />}
      subtitle={patternOf(script.findRegex)}
      subtitleLead={<StageGlyphs placement={script.placement} />}
      subtitlePlacement="inline"
      title={name}
    />
  );
}

/** What the rank column says. A HOST reads `—` on a row that does not run here; a MEMBER reads nothing at
 *  all, because a member's read carries no run order to have a position in (their rows are the room's own
 *  tier, and the order they run in depends on three tiers of the host's library they cannot see). */
function rankLabel(runsAt: number | null, isHost: boolean): string {
  if (runsAt !== null) {
    return String(runsAt);
  }
  return isHost ? NO_RANK : "";
}

/** The title-line marks: the `+N` chip (also attached at N other tiers of this room), the `OFF` state, and
 *  the not-yours mark. All three ride `markers` — the title line — so they never steal the subtitle's width
 *  from the pattern, which is the datum that tells two similarly-named scripts apart.
 *
 *  AND THE RANK, IN WORDS (#1755). The visible numeral sits in `ListRow`'s `leading` slot, which the
 *  primitive marks `aria-hidden` by contract (`primitives/list-row/parts.tsx` — the slot backs no name), so
 *  the rank reached a screen reader as nothing at all. `markers` is the nearest lane that is NOT hidden, and
 *  an `sr-only` line there is the shipped shape for "the compressed glyph is for the eye, the sentence is
 *  the datum" (`preset/components/prompt-assembly/section-row.tsx:162`). Spoken on EVERY arm — including the
 *  room's own tier, whose `<li>` comes from the sortable seal and counts the REORDERABLE tier rather than
 *  the run order — which is why the readable line is not merely a duplicate of `aria-posinset`. */
function RowMarkers({
  alsoAt,
  enabled,
  notYours,
  runsAt,
  effectiveCount,
}: {
  readonly alsoAt: readonly string[];
  readonly enabled: boolean;
  readonly notYours: boolean;
  readonly runsAt: number | null;
  readonly effectiveCount: number | null;
}): ReactElement {
  return (
    <Row align="center" gap="tight">
      {runsAt === null || effectiveCount === null ? null : (
        <Text as="span" className="sr-only">
          {`Runs ${runsAt} of ${effectiveCount}`}
        </Text>
      )}
      {alsoAt.length === 0 ? null : (
        <Badge intent="neutral" size="inline" title={`also attached: ${alsoAt.join(" · ")}`} tone="soft">
          +{alsoAt.length}
        </Badge>
      )}
      {enabled ? null : (
        <Badge intent="neutral" size="inline" tone="soft">
          OFF
        </Badge>
      )}
      {notYours ? (
        <Badge intent="neutral" size="inline" tone="soft">
          previous host
        </Badge>
      ) : null}
    </Row>
  );
}

/** The stages this script bites on, as the shipped glyph strip — the same axis map every other regex surface
 *  reads (`#lib`), so a new placement lands here for free. Each glyph keeps its label in the accessible
 *  tree; the legend above the groups names them once in words. */
function StageGlyphs({ placement }: { readonly placement: readonly (keyof typeof REGEX_PLACEMENT_GLYPHS)[] }): ReactElement {
  return (
    <Row align="center" className="inline-flex" gap="tight">
      {regexPlacementStages(placement).map((stage) => (
        <Icon icon={REGEX_PLACEMENT_GLYPHS[stage]} key={stage} label={REGEX_PLACEMENT_LABELS[stage]} size="xs" />
      ))}
    </Row>
  );
}

/** The row's `⋯`. Two items at most, and never a Move-to-tier: a room gesture must never edit a preset or a
 *  card (§3, the menu row). The trigger's accessible name carries the script's name (§3 (g)). */
function RowActions({
  chatId,
  detach,
  name,
  notYours,
  scope,
  scriptId,
}: {
  readonly chatId: ChatId;
  readonly detach: ReturnType<typeof useDetachScriptFromChat>;
  readonly name: string;
  readonly notYours: boolean;
  readonly scope: RegexTierKey;
  readonly scriptId: RegexTierRowView["script"]["id"];
}): ReactElement {
  if (notYours) {
    // DETACH IS OFFERED HERE, and only detach (#1739): `detachFromChat` gates on the ROOM, never on the
    // script's owner, so the sitting host can always take a departed host's row out of their room. The
    // SWITCH stays absent because `enabled` is the LIBRARY's and remains owner-gated — that is the one
    // thing this row genuinely cannot do, and the menu says which. `Open in library` is absent too: the
    // row is not in this viewer's library, so the drill-in would land on nothing.
    return (
      <RowActionsMenu label={`More for ${name}: not yours — a previous host attached it, Detach from this chat`}>
        <MenuItem disabled={true}>A previous host attached this. Only its owner can switch it off.</MenuItem>
        <MenuItem
          onClick={(): void => {
            detach.mutate({ chatId, scriptId });
          }}
        >
          <Icon icon={Unlink} size="sm" />
          Detach from this chat
        </MenuItem>
      </RowActionsMenu>
    );
  }
  return (
    <RowActionsMenu label={`More for ${name}: Open in library${scope === "chat" ? ", Detach from this chat" : ""}`}>
      <MenuItem
        onClick={(): void => {
          // The library is a CONFIG collection; landing on the group and then selecting the member is the
          // shipped drill-in order (`openConfigTo` clears any stale selection first, #866/#1725).
          openConfigTo(REGEX_COLLECTION);
          selectCollectionMember(REGEX_COLLECTION, scriptId);
        }}
      >
        <Icon icon={BookOpen} size="sm" />
        Open in library
      </MenuItem>
      {scope === "chat" ? (
        <MenuItem
          onClick={(): void => {
            detach.mutate({ chatId, scriptId });
          }}
        >
          <Icon icon={Unlink} size="sm" />
          Detach from this chat
        </MenuItem>
      ) : null}
    </RowActionsMenu>
  );
}

/** The row's SCENT — the find pattern, whole. The edit stamp that used to close this line is dropped (§3,
 *  the row): it caused the one measured truncation in the pane's width, and the pattern is the datum that
 *  tells two rows apart. The empty arm is spelled the same way the library's own projections spell it. */
function patternOf(findRegex: string): string {
  const pattern = findRegex.trim();
  return pattern === "" ? "no pattern yet" : pattern;
}
