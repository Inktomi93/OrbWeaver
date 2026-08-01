// The "Start a chat" HOME tile body — CHAT-owned even though the faces are characters (owner decision
// H6): the tile's data and its intent are "start a chat", and this is the chat landing's former quick-pick
// block MOVED, not forked. `trpc.character.list` is a cache-first cross-feature read — §12 row 2's
// sanctioned channel, not an import of the character feature.
//
// It suspends; home mounts every tile body inside its own `QueryBoundary`.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Users } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { setActiveSection, startNewChat } from "#state";

const QUICK_PICKS_LIMIT = 6;

/** Seeding a draft is chat intent; moving the rail to chats is what makes the draft VISIBLE. */
function startChatWith(characterId: CharacterId): void {
  startNewChat({ characterIds: [characterId] });
  setActiveSection("chats");
}

export function HomeQuickPicksTileBody(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(trpc.character.list.queryOptions({ limit: QUICK_PICKS_LIMIT }));
  const quickPicks = page.items.slice(0, QUICK_PICKS_LIMIT);

  if (quickPicks.length === 0) {
    return (
      <EmptyState
        action={
          <Button intent="secondary" onClick={(): void => setActiveSection("characters")} size="sm">
            <Icon icon={Users} size="sm" />
            Create your first character
          </Button>
        }
        description="Every character is a thread waiting to be woven."
        icon={<Icon icon={Users} size="lg" />}
        title="No characters yet"
      />
    );
  }

  return (
    // `role="list"` needs `listitem` CHILDREN or the rows are generic to AT and the list announces empty —
    // ListRow's root is a plain div, so the role rides a layout-primitive wrapper (the `import-report-
    // summary` precedent; a literal <li> would be invalid HTML under a div[role=list]).
    <Stack aria-label="Character quick-picks" gap="row" role="list">
      {quickPicks.map((character) => {
        // The SAME honest ladder the character library row uses (character-card.tsx): the distilled pitch →
        // the visible tag line → the handle. Never invented copy — a name-only row read as an unfinished
        // list, and the summary this tile already reads carries all three.
        const tagLine = character.tags
          .filter((tag) => !tag.isHiddenOnCard)
          .map((tag) => tag.name)
          .join(" · ");
        return (
          <Row key={character.id} role="listitem">
            <ListRow
              clickable={true}
              leading={
                <Avatar
                  fallbackDelay={0}
                  hueSeed={character.id}
                  shape="square"
                  size="sm"
                  {...(character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) })}
                >
                  {initialsFor(character.name)}
                </Avatar>
              }
              onClick={(): void => startChatWith(castId<CharacterId>(character.id))}
              subtitle={character.elevatorPitch ?? (tagLine === "" ? character.handle : tagLine)}
              title={character.name}
            />
          </Row>
        );
      })}
    </Stack>
  );
}
