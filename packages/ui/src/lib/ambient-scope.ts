// What a ThemeScope hands its descendants beside its base and accent, below both, because `MessageBubble` reads it too.
import type { MessageRole } from "@orb/kit/message-role";
import { createContext } from "react";

export const PROSE_INK_FIELDS = ["speaker", "dialogueColor", "narrationColor", "bodyColor"] as const;

/** The prose inks of a scope and the scopes around it, validated, which a bubble box restates judged on its fill. */
export type ProseInks = Readonly<Partial<Record<(typeof PROSE_INK_FIELDS)[number], string>>>;

/** A fill a scope picked: the opaque pixel it reads as, and the authored value the box paints, which may be translucent. */
export interface PickedFill {
  readonly pixel: string;
  readonly paint: string;
}

/** The fill a scope picked for each role. */
export type PickedFills = Readonly<Partial<Record<MessageRole, PickedFill>>>;

/** One role's box as a whole surface: its fill, and the palette it restates on itself for what it holds. */
export interface BubbleScope {
  readonly fill: PickedFill;
  readonly vars: Readonly<Record<string, string>>;
  readonly colorScheme: "light" | "dark" | undefined;
}

export type BubbleScopes = Readonly<Partial<Record<MessageRole, BubbleScope>>>;

export interface AmbientScope {
  readonly inks?: ProseInks;
  /** The picked bubble fills around this scope. */
  readonly fills?: PickedFills;
  /** The bubble scopes in force, which `MessageBubble` reads. */
  readonly scopes?: BubbleScopes;
  /** The opaque pixel of the fill this scope sits inside, when a bubble box set it. */
  readonly inside?: string | undefined;
}

export const AmbientScopeContext = createContext<AmbientScope>({});
