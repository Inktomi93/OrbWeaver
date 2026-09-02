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
import type { SelectOption } from "@orb/ui/select";

const CHAT_STYLE_LABELS: Record<AppearanceSettings["chatStyle"], string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
  echo: "Echo",
  whisper: "Whisper",
  hush: "Hush",
  ripple: "Ripple",
  tide: "Tide",
};

/** One line per mode, rendered INSIDE its own option row (`SelectOption.description`).
 *
 *  These used to be two things, neither of which a reader could use at the moment of choosing: a
 *  parenthetical crammed into five of the eight LABELS ("Echo (bled portrait)"), and one legend
 *  paragraph on the field, which the popup covers the instant the select opens (side-eye 2026-08-16).
 *  A mode's gloss belongs on the row you are about to pick, so the label went back to being the mode's
 *  NAME and the explanation moved here. A `Record` over the union, so a ninth chatStyle fails tsc here
 *  until someone writes its line (spine §5.5). */
const CHAT_STYLE_DESCRIPTIONS: Record<AppearanceSettings["chatStyle"], string> = {
  bubble: "Each message sits in its own tinted bubble.",
  flat: "Full-width rows with no bubble, like a script.",
  document: "One centered manuscript column.",
  echo: "The speaker's portrait bleeds into the edge of the bubble.",
  whisper: "A wide banner of the speaker's art sits above the text.",
  hush: "Flat rows, each marked with the speaker's color stripe.",
  ripple: "A tall portrait sticks beside the text as you scroll.",
  tide: "Every paragraph becomes its own small bubble.",
};

/** The message-row anatomy options — the viewer's own `appearance.chatStyle` setting (never card-forced). */
export const CHAT_STYLE_ITEMS: readonly SelectOption<string>[] = THEME_CHAT_STYLES.map((value) => ({
  value,
  label: CHAT_STYLE_LABELS[value],
  description: CHAT_STYLE_DESCRIPTIONS[value],
}));

export const AVATAR_SIZE_ITEMS: readonly SelectOption<string>[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] satisfies readonly { value: AppearanceSettings["avatarSize"]; label: string }[];

export const AVATAR_SHAPE_ITEMS: readonly SelectOption<string>[] = [
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
] satisfies readonly { value: AppearanceSettings["avatarShape"]; label: string }[];

export const AVATAR_ASPECT_ITEMS: readonly SelectOption<string>[] = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait (2:3)" },
] satisfies readonly { value: AppearanceSettings["avatarAspect"]; label: string }[];

export const AVATAR_RING_ITEMS: readonly SelectOption<string>[] = [
  { value: "none", label: "None" },
  { value: "accent", label: "Accent" },
] satisfies readonly { value: AppearanceSettings["avatarRing"]; label: string }[];

export const MESSAGE_ACTIONS_ITEMS: readonly SelectOption<string>[] = [
  { value: "hover", label: "Reveal on hover" },
  { value: "expanded", label: "Always visible" },
] satisfies readonly { value: AppearanceSettings["messageActions"]; label: string }[];
