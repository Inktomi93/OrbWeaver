// `ON SCREEN` — the last group of the room's Regex section, and the display leg's own roster
// (the `ON SCREEN` row; v2 change (b)).
//
// IT IS NOT A TIER, AND THAT IS THE POINT. The display leg is ATTACHMENT-BLIND by the 2026-08-02 O-4 ruling:
// what runs on YOUR transcript is your whole library ∩ `DISPLAY`, plus the host's broadcast set when the host
// opted this room in (`data/use-display-scripts.ts`). No per-chat tier lever and no room master can reach it,
// so drawing these rows inside the tier groups above would put them under switches that do not govern them.
// They get their own roster, their own provenance word, and their own sentence: what you see, now.
//
// THE HOST'S BROADCAST SWITCH LIVES HERE (§2, §3). It was `Host controls › Appearance` — one regex control
// under an appearance name, in the host band, three doors away from every other regex lever. That disclosure
// retired with this section; `HostDisplayScriptsControl` itself is unchanged and moved whole.
//
// A MEMBER GETS THIS GROUP TOO, unlike the mock's member board (which draws neither this roster nor the
// broadcast line). §7.5 requires the "member with broadcast on" state to be rendered, and it is exactly this:
// a member whose transcript is being restyled by the host's scripts must be able to see WHICH ones and turn
// their own off. What a member does not get is the broadcast SWITCH (host-only) — the §8.1 permission-OMIT.
//
// ONLY YOUR OWN ROWS CARRY A SWITCH. A broadcast row is the HOST's library row: you cannot flip someone
// else's library flag, and a control that looked operable and was not is the affordance lie the sibling racks
// exist to correct. Your own scripts still apply on top of the host's, which is what the provenance word and
// the ordering (broadcast first, yours last) already say.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { BookOpen, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { RowActionsMenu } from "#components";
import { DISPLAY_PLACEMENT, useDisplayScripts, useInvalidation, useTRPC } from "#data";
import { regexScriptTitle } from "#lib";
import { openConfigTo, selectCollectionMember } from "#state";
import { useSetRegexScriptEnabled } from "../hooks/use-chat-regex-mutations.ts";
import { HostDisplayScriptsControl } from "./host-display-scripts-control.tsx";

/** The config group the script library lives in — the `⋯ → Open in library` destination (#1725). */
const REGEX_COLLECTION = "regex";

export interface RegexOnScreenGroupProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
}

export function RegexOnScreenGroup({ chatId, isHost }: RegexOnScreenGroupProps): ReactElement {
  const trpc = useTRPC();
  // The viewer's OWN library — the provenance test (`yours` vs `the host's`) and the switch gate. It is the
  // same cache entry `useDisplayScripts` reads, so this costs no second request.
  const { data: owned } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const inForce = useDisplayScripts(chatId);
  const ownedIds = new Set(owned.map((script) => script.id));
  // THE ROSTER IS "IN FORCE" PLUS YOUR OWN SWITCHED-OFF DISPLAY SCRIPTS, and the second half is what makes
  // the switch round-trippable: `useDisplayScripts` filters on `enabled` by construction, so a row flipped
  // off here would VANISH and the only way back would be the library. The off rows carry the `OFF` mark and
  // no rank claim — the canvas draws exactly that arm.
  const rows = [...inForce, ...owned.filter((script) => !script.enabled && script.placement.includes(DISPLAY_PLACEMENT))];
  return (
    <Section data-slot="regex-on-screen" kicker={<>On screen</>}>
      <Text voice="gloss">
        Display scripts change what <b>you</b> see, now. Yours come from your library; the host can broadcast theirs.
      </Text>
      {rows.length === 0 ? (
        <Text voice="gloss">No display scripts are running on your transcript here.</Text>
      ) : (
        <Stack gap="tight" role="list">
          {rows.map((script) => (
            <Stack key={script.id} role="listitem">
              <DisplayScriptRow isYours={ownedIds.has(script.id)} script={script} />
            </Stack>
          ))}
        </Stack>
      )}
      {isHost ? <HostDisplayScriptsControl chatId={chatId} /> : null}
    </Section>
  );
}

/** One display-leg row: name · pattern · provenance, and — for the viewer's own — the library switch. */
function DisplayScriptRow({ isYours, script }: { readonly isYours: boolean; readonly script: RegexScriptRow }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetRegexScriptEnabled({ trpc, invalidation });
  const name = regexScriptTitle(script);
  return (
    <ListRow
      markers={
        script.enabled ? null : (
          <Badge intent="neutral" size="inline" tone="soft">
            OFF
          </Badge>
        )
      }
      {...(isYours
        ? {
            actions: (
              <Row align="center" gap="tight">
                {/* The SAME "everywhere" name as a tier row's switch, because it is the same flag on the
                    same library row — a display script turned off here is off in every room. */}
                <Switch
                  aria-label={`${name} — everywhere`}
                  checked={script.enabled}
                  onCheckedChange={(next): void => {
                    setEnabled.mutate({ scriptId: script.id, input: { enabled: next } });
                  }}
                  tone="quiet"
                />
                <RowActionsMenu label={`More for ${name}: Open in library`}>
                  <MenuItem
                    onClick={(): void => {
                      openConfigTo(REGEX_COLLECTION);
                      selectCollectionMember(REGEX_COLLECTION, script.id);
                    }}
                  >
                    <Icon icon={BookOpen} size="sm" />
                    Open in library
                  </MenuItem>
                </RowActionsMenu>
              </Row>
            ),
          }
        : {})}
      subtitle={`${script.findRegex.trim() === "" ? "no pattern yet" : script.findRegex.trim()} · ${isYours ? "yours" : "the host’s"}`}
      subtitlePlacement="inline"
      title={name}
    />
  );
}
