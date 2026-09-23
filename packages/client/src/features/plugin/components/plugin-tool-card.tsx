// plugin-tool-card — what a PLUGIN's tool call looks like in the transcript (U3, §4.5's
// tool-card row; closes the recorded A2-F5 renderer gap). Until now a plugin could put a tool in front of the
// model but had no way to draw its result: the client tool-renderer registry is first-party and
// door-assembled, so every plugin tool landed in the generic `ToolCallBlock` — the oracle-deck's own README
// says so in as many words.
//
// THE ONE CONTRIBUTION, FANNING INSIDE (G8 — the `PluginAnchoredSurfaces` shape one registry over): the door
// grows by a single `plugin_`-PREFIX renderer, never one per plugin (a plugin tool's wire name is
// `plugin_<slug'>_<name>`, unknowable at assembly time). This component does the per-plugin fan off
// `plugin.listSurfaces` — the caller's OWN enabled plugins' registrations, owner-scoped server-side (v1
// invariant: viewer == installer).
//
// THE FALLBACK IS THE NULL STATE HERE, and that is the opposite of the flank (§4.9). A tool call is CANON: it
// happened, the model read its result, and the transcript owes the reader a record of it. So every arm that is
// not "this plugin registered a static card for this exact tool" renders the GENERIC BLOCK, never nothing —
// no surface, a scripted-tier card with no spec yet (U4), a plugin whose name has not resolved (the §4.8
// labelled-or-absent wall), a not-yet-loaded list. Silence would delete evidence from a conversation.
//
// The card BINDS the record, not the published plane (`plugin-tool-card-state.ts`): a card is per-CALL, so an
// old draw keeps showing the cards it drew.

import type { ToolCallRecord } from "@orb/contracts/chat";
import { ToolCallBlock } from "@orb/ui/tool-call-block";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { useActiveChatId } from "#state";
import { toolCardState } from "../lib/plugin-tool-card-state.ts";
import { PluginFrame } from "./plugin-frame.tsx";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

export interface PluginToolCardProps {
  /** The persisted call — the client's ONLY tool read surface (chat never body-parses for tool markers). */
  readonly record: ToolCallRecord;
}

/** A plugin tool call: its owning plugin's registered card, or the generic block. */
export function PluginToolCard({ record }: PluginToolCardProps): ReactElement {
  const trpc = useTRPC();
  // Plain `useQuery` on both reads: this mounts inside the transcript, which has no Suspense boundary of its
  // own per row — a suspending read here would blank the message a person is reading. `undefined` (not loaded,
  // or failed) takes the same arm as "no card registered": the generic block.
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  // The room a frame card's chat-scoped host calls go to. The renderer contract hands a card only its record,
  // but a card renders only inside the open thread (`ChatContent` keys the room by the active chat's id), so
  // the active chat IS this card's chat, the `message-media-block` precedent. The server still re-checks that
  // the caller can read it.
  const chatId = useActiveChatId();

  // `toolWireName` is the SERVER's projection of `plugin_<slug'>_<toolName>` (the one mint lives in contracts;
  // the client never re-derives the namespacing rule). A surface only carries it at the `tool-card` anchor.
  const surface = (surfaces ?? []).find((row) => row.toolWireName === record.name && (row.tier === "frame" || row.spec !== undefined));
  const pluginName = surface === undefined ? undefined : plugins?.find((row) => row.id === surface.pluginId)?.name;
  if (surface === undefined || pluginName === undefined) {
    return <ToolCallBlock record={record} />;
  }
  // U7 — the ARBITRARY-CARD-ART arm (§6.1). LAZY, never per-row-eager: the mint happens on mount and the iframe
  // itself carries `loading="lazy"`, so a transcript scrolled past a plugin tool call pays for nothing. Note
  // what a frame card CANNOT do that a declarative one can: bind `{ $state }` to the `ToolCallRecord`. A frame
  // is a document, and handing it the call's args/result would be a new read channel this phase did not price —
  // so a frame card draws the plugin's own art and the record's facts stay with the declarative arm.
  // The FALLBACK is explicit here and nowhere else: this anchor's law is the opposite of the flank's. A frame
  // that cannot mint must still leave the call's record in the transcript, so it degrades to the generic block
  // rather than to silence.
  if (surface.tier === "frame") {
    return (
      <PluginFrame
        chatId={chatId ?? undefined}
        fallback={<ToolCallBlock record={record} />}
        pluginId={surface.pluginId}
        pluginName={pluginName}
        surfaceId={surface.id}
        title={surface.title}
      />
    );
  }
  if (surface.spec === undefined) {
    return <ToolCallBlock record={record} />;
  }
  return (
    <PluginSurfaceShell pluginName={pluginName} title={surface.title}>
      <PluginSurfaceRenderer anchor="tool-card" pluginId={surface.pluginId} spec={surface.spec} state={toolCardState(record)} surfaceId={surface.id} />
    </PluginSurfaceShell>
  );
}
