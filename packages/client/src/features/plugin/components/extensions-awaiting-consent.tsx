// The Extensions section's AWAITING-CONSENT block (#1699) — the one arm of the teaching empty that is not
// actually empty, rendered by BOTH panes so they cannot drift (`extensions-page-surface.tsx`'s mirror law).
//
// WHAT #924 LEFT AND WHAT THIS FIXES. #924 split "no pages" into four facts and gave each its own next step,
// which made this arm say the right thing: `Your plugins are waiting on you`. What it kept was the generic
// EmptyState shape — so nine installed plugins rendered as ONE `button "Review what they ask for"`, the only
// map row on the surface with no semantic identity. Measured cold-start verdict (side-eye 2026-09-05): a
// first-timer landing on Extensions with nine plugins installed "cannot name a single thing they have
// installed", which fails the five-second test outright. The FACT and its COUNT are unchanged and still come
// from the one copy home; what is added is the identity the count could not carry.
//
// NOT AN `<EmptyState>`, AND THAT IS THE POINT — not a dodge of `empty-state-has-action`. This state has
// content: N installed plugins, each with a name, a state and a decision the person owes it. `EmptyState` is
// the teaching pattern for a pane with NOTHING in it (icon → title → description → ONE action, centred), and
// pouring a roster into its single `action` slot would be using the part against its own contract. The three
// genuinely-empty arms keep it verbatim.
//
// STATE IS TEXT, NEVER A VOICE (#1169's budget). Each row wears the SAME `statusCopy` badge the Plugins
// screen paints for the same plugin — one derivation, so the two surfaces cannot spell one plugin's state two
// ways, and the state is readable rather than inferred from a colour.
//
// EVERY CTA LANDS ON THE SAME GRANT CONTROL, and that is honest rather than lazy: there is no per-plugin
// config anchor to deep-link to (`plugins-nav.ts` declares ONE grant setting id, and minting a dynamic anchor
// per installed plugin is a config-nav change, not this row's). What the per-plugin name buys is the thing
// the finding is about — the person knows WHICH plugin they are about to answer for before they leave this
// pane, and the arriving screen carries all of them in one place.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Blocks, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { openConfigTo } from "#state";
import type { ExtensionsEmptyView } from "../hooks/use-extensions-empty.ts";
import { EXTENSIONS_EMPTY_COPY } from "../lib/extensions-copy.ts";
import { statusCopy } from "../lib/plugin-copy.ts";

/** The arm's copy, by its key in the one home — read once so the block cannot spell a fifth reason's words. */
const COPY = EXTENSIONS_EMPTY_COPY["awaiting-consent"];

/** The row CTA's one spelling. A verb sentence with the plugin's name inside it, which is what makes nine of
 *  these distinguishable by voice and by ear — the `rowActionSubject` grammar, stated locally because this
 *  block's door is a full-width Button rather than a row control. */
function reviewLabel(pluginName: string): string {
  return `Review what ${pluginName} asks for`;
}

export interface ExtensionsAwaitingConsentProps {
  /** The plugins standing on the caller's consent — `useExtensionsEmpty`'s own rows, never a second read. */
  readonly plugins: ExtensionsEmptyView["awaitingPlugins"];
}

/** The teaching statement, then one named row per plugin that is waiting. */
export function ExtensionsAwaitingConsent({ plugins }: ExtensionsAwaitingConsentProps): ReactElement {
  return (
    <Stack gap="block">
      <Stack gap="tight">
        {/* `h2`, for the same reason `EmptyState.titleAs="h2"` exists on the sibling arms: this block IS its
            pane's content, and a section landing with zero headings dead-ends heading navigation inside the
            pane the reader is looking at. */}
        <Heading level={2} voice="label">
          {COPY.title}
        </Heading>
        <Text prose={true} voice="gloss">
          {COPY.description(plugins.length)}
        </Text>
      </Stack>
      {/* NOT `ListRow`, and the reason is measured. A row's trailing `actions` slot is `shrink-0` and this CTA
          is a SENTENCE — `Review what Oracle Deck asks for` is ~210px of `whitespace-nowrap` — so in the 307px
          LIST pane it took the whole row and crushed the `truncate min-w-0` title to ZERO width: the plugin's
          name was in the DOM and rendered at 0x0, which is the identity defect again in a new spelling. Caught
          by this block's own CT, which asserts the name is VISIBLE rather than merely attached. So the name
          and its state get their own line and the door gets the next one. */}
      <Stack gap="block">
        {plugins.map((plugin) => {
          const status = statusCopy(plugin.status, plugin.reconsentPending, plugin.grantedCapabilities.length);
          return (
            <Stack gap="tight" key={plugin.id}>
              {/* `flex-wrap`: the state badge is `whitespace-nowrap` by design and its longest arm is a whole
                  sentence ("Off - asked for more than you allowed"), so the ROW is what bends - the same
                  collision `plugin-row.tsx` already had to answer at ~390px. */}
              <Row align="center" className="flex-wrap" gap="field">
                <Icon icon={Blocks} size="sm" />
                <Text voice="label">{plugin.name}</Text>
                <Badge intent={status.intent} size="sm">
                  {status.label}
                </Badge>
              </Row>
              <Button intent="secondary" onClick={(): void => openConfigTo("plugins", COPY.sub, COPY.setting)} size="sm">
                {reviewLabel(plugin.name)}
              </Button>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
