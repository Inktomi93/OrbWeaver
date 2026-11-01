// What a ThemeScope hands its descendants beside its base and accent, below both, because `MessageBubble` reads it too.
import type { MessageRole } from "@orb/kit/message-role";
import { createContext } from "react";

export const PROSE_INK_FIELDS = ["speaker", "dialogueColor", "narrationColor", "bodyColor"] as const;

/** The prose inks of a scope and the scopes around it, validated, which a bubble box restates judged on its fill. */
export type ProseInks = Readonly<Partial<Record<(typeof PROSE_INK_FIELDS)[number], string>>>;

/** The opaque fill a scope picked for each role. */
export type BubbleFillPixels = Readonly<Partial<Record<MessageRole, string>>>;

/** One role's box: its fill, and the vars it restates on itself. */
export interface BubbleScope {
  readonly fill: string;
  readonly vars: Readonly<Record<string, string>>;
}

export type BubbleScopes = Readonly<Partial<Record<MessageRole, BubbleScope>>>;

export interface AmbientScope {
  readonly inks?: ProseInks;
  /** The picked bubble fills around this scope. */
  readonly fills?: BubbleFillPixels;
  /** The bubble scopes in force, which `MessageBubble` reads. */
  readonly scopes?: BubbleScopes;
  /** The fill this scope sits inside, when a bubble box set it. */
  readonly inside?: string | undefined;
}

export const AmbientScopeContext = createContext<AmbientScope>({});
