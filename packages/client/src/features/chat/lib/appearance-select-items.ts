// The labelled Select/option tables for the CHAT-owned appearance sections (avatars · message details &
// actions) — pure data, not JSX. Each `value` is pinned to the AppearanceSettings field
// union via `satisfies`/a total `Record`, so a typo'd value is a tsc error, not a silently-unselectable
// option.
//
// Split out of the settings feature's one `appearance-select-items.ts` at SET-SEAMS stage 1: the appearance
// pane decomposed into sections owned by their READERS, and these tables belong to the chat-owned half. The
// app-shell-owned half (elevation/surface texture/blur surfaces/background) lives at
// `features/app-shell/lib/appearance-select-items.ts` — two features, two tables, no shared drawer.
// `DENSITY_ITEMS` still homes at `#lib` (three features render it); `CHAT_STYLE_ITEMS` came back HERE when
// the theme editor's Message-style select was struck (TD/O-4) and chat became its only reader — a table
// homes with its reader (D114), and the shared floor is for vocabulary that is actually shared.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { SelectItems } from "@orb/ui/select";

const CHAT_STYLE_LABELS: Record<AppearanceSettings["chatStyle"], string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
  echo: "Echo (bled portrait)",
  whisper: "Whisper (avatar banner)",
  hush: "Hush (flat + speaker stripe)",
  ripple: "Ripple (VN sticky portrait)",
  tide: "Tide (paragraph bubbles)",
};
/** The message-row anatomy options — the viewer's own `appearance.chatStyle` setting (never card-forced). */
export const CHAT_STYLE_ITEMS: SelectItems<string> = THEME_CHAT_STYLES.map((value) => ({
  value,
  label: CHAT_STYLE_LABELS[value],
}));

export const AVATAR_SIZE_ITEMS: SelectItems<string> = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] satisfies readonly { value: AppearanceSettings["avatarSize"]; label: string }[];

export const AVATAR_SHAPE_ITEMS: SelectItems<string> = [
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
] satisfies readonly { value: AppearanceSettings["avatarShape"]; label: string }[];

export const AVATAR_ASPECT_ITEMS: SelectItems<string> = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait (2:3)" },
] satisfies readonly { value: AppearanceSettings["avatarAspect"]; label: string }[];

export const AVATAR_RING_ITEMS: SelectItems<string> = [
  { value: "none", label: "None" },
  { value: "accent", label: "Accent" },
] satisfies readonly { value: AppearanceSettings["avatarRing"]; label: string }[];

export const MESSAGE_ACTIONS_ITEMS: SelectItems<string> = [
  { value: "hover", label: "Reveal on hover" },
  { value: "expanded", label: "Always visible" },
] satisfies readonly { value: AppearanceSettings["messageActions"]; label: string }[];
