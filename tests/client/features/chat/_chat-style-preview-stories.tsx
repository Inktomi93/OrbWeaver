// Production renderer capture for the owned chat-style picker images; no miniature geometry overrides.
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { NameRowFrame } from "../../../../packages/client/src/features/chat/components/message-name-row-frame.tsx";
import { renderSingleBubble } from "../../../../packages/client/src/features/chat/components/message-row-bubble.tsx";
import { renderRowAvatar } from "../../../../packages/client/src/features/chat/components/message-row-parts.tsx";
import type { BubbleDecorationArgs, RowSkin } from "../../../../packages/client/src/features/chat/lib/message-row-variants.ts";
import { columnClassFor, gutterRailFor, MESSAGE_ROW_SKINS, rowBodyClassFor } from "../../../../packages/client/src/features/chat/lib/message-row-variants.ts";

type ChatStyle = ThemeChatStyle;
const PREVIEW_COPY: Record<MessageRole, { readonly name: string; readonly line: string; readonly followup: string }> = {
  user: {
    name: "You",
    line: "Wait by the old gate.",
    followup:
      "I'll bring the map. We can follow the river past the watchtower, then take the sheltered path through the trees before the storm reaches the valley.",
  },
  assistant: {
    name: "Mira",
    line: "The lantern is still warm.",
    followup:
      "Someone was here. Mira turns the lantern toward the archway, watching the rain settle on the worn stones while the distant bell marks the end of the watch.",
  },
  system: { name: "Story", line: "The room falls quiet.", followup: "" },
};
const PREVIEW_ART: Record<Parameters<NonNullable<BubbleDecorationArgs["imageUrlFor"]>>[0], string> = {
  icon: "/illustrations/chat-style-portrait.svg",
  portrait: "/illustrations/chat-style-portrait.svg",
  banner: "/illustrations/chat-style-banner.svg",
};
const previewImageUrl: NonNullable<BubbleDecorationArgs["imageUrlFor"]> = (variant) => PREVIEW_ART[variant];

function PreviewHeader({ speaker, skin }: { readonly speaker: MessageRole; readonly skin: RowSkin }): ReactElement {
  return (
    <NameRowFrame
      identity={
        <Text as="span" voice="label">
          {PREVIEW_COPY[speaker].name}
        </Text>
      }
      actions={null}
      placement={skin.headerPlacement}
      stickyAttribution={false}
      mirrored={speaker === "user" && skin.headerPlacement === "inside"}
    />
  );
}

function PreviewLine({ style, speaker }: { readonly style: ChatStyle; readonly speaker: MessageRole }): ReactElement {
  const skin = MESSAGE_ROW_SKINS[style];
  const copy = PREVIEW_COPY[speaker];
  const kind = speaker === "user" ? "persona" : "character";
  const decoration =
    skin.bubbleDecoration?.({
      kind,
      avatarHash: null,
      hueSeed: copy.name,
      initial: copy.name[0] ?? "",
      showInChatAvatars: true,
      imageUrlFor: previewImageUrl,
    }) ?? null;
  const treatment = skin.avatarTreatment(kind);
  const avatar = renderRowAvatar({
    attribution: { name: copy.name, kind, avatarHash: null, avatarAssetId: null, hueSeed: copy.name, tokens: null },
    avatarTreatment: treatment,
    role: speaker,
    showInChatAvatars: true,
    avatarSize: "md",
    avatarShape: "round",
    avatarAspect: "square",
    avatarRing: "none",
    alignToInsideHeader: skin.headerPlacement === "inside",
    gutterRail: gutterRailFor(skin, speaker),
    imageUrlFor: previewImageUrl,
  });
  const header = <PreviewHeader speaker={speaker} skin={skin} />;
  const leadingAvatar = treatment === "sticky-portrait" || speaker === "user" ? null : avatar;
  const trailingAvatar = treatment === "sticky-portrait" || speaker !== "user" ? null : avatar;
  const prose = (
    <Stack gap="row">
      <Markdown trust="untrusted" mode="static" inlineDice={true}>{`${copy.line}\n\n${copy.followup}`}</Markdown>
    </Stack>
  );
  const bubble =
    skin.bubbleLayout === "trains" ? (
      <Stack gap="field" data-slot="message-bubble-train">
        {[copy.line, copy.followup].map((paragraph) => (
          <Stack key={paragraph} gap="row" className={skin.inner(speaker)} data-slot="message-bubble">
            <Stack gap="row">
              <Markdown trust="untrusted" mode="static" inlineDice={true}>
                {paragraph}
              </Markdown>
            </Stack>
          </Stack>
        ))}
      </Stack>
    ) : (
      renderSingleBubble({
        role: speaker,
        header: skin.headerPlacement === "inside" ? header : null,
        content: prose,
        bubbleClassName: skin.inner(speaker),
        decoration,
        weldedAvatar: treatment === "sticky-portrait" ? avatar : null,
      })
    );
  return (
    <Stack className={`@container ${skin.outer(speaker)}`} data-role={speaker} data-slot="chat-style-preview-message">
      <Row align="start" gap="row" className={`${rowBodyClassFor(skin)} @max-md:gap-field @max-md:*:data-[slot=avatar-root]:size-6`}>
        {leadingAvatar}
        <Stack gap="row" data-slot="message-content-column" className={columnClassFor(skin)} style={skin.columnStyle}>
          {skin.headerPlacement === "outside" ? header : null}
          {bubble}
        </Stack>
        {trailingAvatar}
      </Row>
    </Stack>
  );
}

export function ChatStyleRendererCaptureStory({ style, light = false }: { readonly style: ChatStyle; readonly light?: boolean }): ReactElement {
  return (
    <Stack
      data-theme={light ? "light" : undefined}
      data-chat-style={style}
      data-slot="chat-style-renderer-capture"
      className="bg-background text-foreground p-block"
      style={{ width: "var(--width-content-col-wide)", height: "calc(var(--width-content-col-wide) * 3 / 4)" }}
      justify="center"
      gap="block"
    >
      <PreviewLine speaker="user" style={style} />
      <PreviewLine speaker="assistant" style={style} />
    </Stack>
  );
}
