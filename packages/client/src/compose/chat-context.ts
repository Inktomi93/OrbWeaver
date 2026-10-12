// The door's contributor registries that are injected a read channel or ship empty, split out of
// `authed-app.tsx` so the CT door takes the same assemblies the app mounts (Spine-Testing §10). The injected
// ones are factories because the app and a CT hand them different `{ trpc, queryClient }` singletons.

import { automationActivityTab } from "#features/automation";
import { makeRpgContextTabs, makeRpgHudRegion } from "#features/rpg";
import type { CharacterDetailContribution, ChatContextState, ContextRegionDef, ContextTabDef, ContributorRegistry, MessageToolsRenderer } from "#lib";
import { createContributorRegistry } from "#lib";

type ReadChannel = Parameters<typeof makeRpgContextTabs>[0];

// The chat-context contributor seam (§6c): the rpg takeover's four LITE game tabs — the FIRST real consumer of
// this seam. rpg exports the SELF-CONTAINED factory `makeRpgContextTabs` ({trpc, queryClient}) — the door
// injects the cross-domain read channel (§12) and assembles the result into the registry, which chat merges at
// `defineContextTabs`'s `contributors` arm. rpg never imports chat; the `when`/`strip:"game"` gating (a
// cache-first getChat.rpg read) drives the §4.2 bracket.
// (B2's host-only "Rules" TAB used to ride here too. It was RETIRED at #616 — the owner ruled the surface
// belongs as a SECTION inside "This chat", and it now grafts through `chatSettingsSections` in `contributors.ts`.)
export function makeChatContextContributors(channel: ReadChannel): ContributorRegistry<ContextTabDef<ChatContextState>> {
  return createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", [
    ...makeRpgContextTabs(channel),
    // B11 — the room ACTIVITY tab (host-only), automation's second CONTEXT-strip graft: a ready def (no injected
    // read channel — its body reads through `useTRPC`), sibling of Members/"This chat"/Preview. automation owns
    // it because `client-features-no-cross` forbids chat from importing the fire-outcome copy it renders.
    automationActivityTab,
  ]);
}

// The chat-context REGION-CLAIM seam (§6c / HUD-1 §3.2): the rpg HUD claims the WHOLE CONTEXT pane on an
// engaged game chat — same door, same injected read channel, same one-directional flow as the tabs above.
// Every other chat (and every other section) has no claimant and renders the generic panel.
export function makeChatContextRegions(channel: ReadChannel): ContributorRegistry<ContextRegionDef<ChatContextState>> {
  return createContributorRegistry<ContextRegionDef<ChatContextState>>("chat-context-regions", [makeRpgHudRegion(channel)]);
}

// The WHOLE-MESSAGE tool-renderer seam (§6c): the per-message override that renders ALL of a message's tool
// records together so a contributor can AGGREGATE across them (the per-tool registry cannot see across
// records). Delivered via a context provider; the FIRST renderer to claim a message owns its whole tool block,
// else chat falls back to the per-record path. Empty ⇒ byte-identical.
export const messageToolsRenderers = createContributorRegistry<MessageToolsRenderer>("message-tools-renderer", []);

// The character-detail contributor seam (§6c): EMPTY but typed — the door → factory → editor-body anchor
// path is compiled and exercised with zero contributions; the agents feature appends its card-evolution
// review section later (crew 07-client-ui §4.2), grafting into the editor WITHOUT importing character.
export const characterDetailContributors = createContributorRegistry<CharacterDetailContribution>("character-detail", []);
