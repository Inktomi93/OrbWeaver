// The Appearance settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. Registered at the door (main.tsx); settings owns this pane (O3).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve SunMoon fine (the settings-nav.ts precedent).
import { SunMoon } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { AppearanceSettingsSurface } from "../surfaces/appearance-settings-surface";
import { APPEARANCE_SUBCATEGORY_IDS } from "./appearance-nav";

export const appearancePane: SettingsPaneDefinition = {
  id: "appearance",
  group: "user",
  label: "Appearance",
  icon: SunMoon,
  description: "Theme, message style, and display density.",
  subcategories: [
    {
      id: APPEARANCE_SUBCATEGORY_IDS.messageStyle,
      label: "Message style",
      settings: [
        {
          id: "chat-style",
          label: "Chat display",
          keywords: ["bubble", "flat", "document", "immersive", "echo", "whisper", "ripple"],
        },
        { id: "density", label: "Density", keywords: ["compact", "comfortable", "spacing"] },
        {
          id: "elevation",
          label: "Surface elevation",
          keywords: ["layered", "depth", "shadow", "flat"],
        },
        {
          id: "auto-fix-markdown",
          label: "Auto-fix unfinished formatting",
          keywords: ["markdown", "italic", "bold", "asterisk"],
        },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.avatars,
      label: "Avatars",
      keywords: ["portrait", "picture"],
      settings: [
        { id: "show-avatars", label: "Show avatars in chat" },
        { id: "avatar-size", label: "Avatar size" },
        { id: "avatar-shape", label: "Avatar shape" },
        { id: "avatar-aspect", label: "Avatar aspect" },
        { id: "avatar-ring", label: "Avatar ring" },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.sizing,
      label: "Sizing",
      settings: [
        {
          id: "chat-width",
          label: "Chat width",
          keywords: ["width", "column", "reading"],
        },
        { id: "font-scale", label: "Text size", keywords: ["font", "scale", "zoom"] },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.motion,
      label: "Motion",
      settings: [
        {
          id: "reduced-motion",
          label: "Reduce motion",
          keywords: ["animation", "transition", "accessibility"],
        },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.messageDetails,
      label: "Message details",
      keywords: ["metadata"],
      settings: [
        { id: "show-timestamps", label: "Show timestamps", keywords: ["time", "date"] },
        { id: "show-message-id", label: "Show message ID" },
        { id: "show-model", label: "Show model" },
        { id: "show-token-count", label: "Show token count", keywords: ["tokens", "usage"] },
        {
          id: "show-reasoning",
          label: "Show reasoning icon",
          keywords: ["thinking", "reasoning"],
        },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.messageActions,
      label: "Message actions",
      settings: [
        {
          id: "message-actions",
          label: "Action cluster",
          keywords: ["edit", "delete", "fork", "copy", "hide", "hover"],
        },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.background,
      label: "Background",
      keywords: ["wallpaper", "photo", "image"],
      settings: [
        { id: "background-image", label: "Background image", keywords: ["photo", "wallpaper"] },
        { id: "background-dim", label: "Scrim opacity", keywords: ["darken", "overlay"] },
        { id: "background-blur", label: "Image blur" },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.reading,
      label: "Reading typography",
      keywords: ["text", "prose", "font"],
      settings: [
        { id: "line-height", label: "Line height", keywords: ["leading", "spacing"] },
        { id: "letter-spacing", label: "Letter spacing", keywords: ["tracking", "kerning"] },
        { id: "paragraph-spacing", label: "Paragraph spacing" },
        { id: "name-scale", label: "Speaker name size" },
        { id: "body-scale", label: "Message text size" },
        { id: "justify", label: "Justify message text", keywords: ["align", "manuscript"] },
      ],
    },
    {
      id: APPEARANCE_SUBCATEGORY_IDS.effects,
      label: "Effects",
      settings: [
        {
          id: "frosted-glass",
          label: "Frosted glass",
          keywords: ["blur", "glass", "backdrop"],
        },
        { id: "glass-blur", label: "Glass blur radius" },
        { id: "prose-shadow", label: "Prose shadow", keywords: ["halo", "readability"] },
        {
          id: "accent-tint",
          label: "Tint the UI with the accent color",
          keywords: ["accent", "color", "border", "hairline"],
        },
      ],
    },
  ],
  body: () => <AppearanceSettingsSurface />,
};
