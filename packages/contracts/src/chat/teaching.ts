// What a teaching contribution reads and returns. A contribution is a foreign domain's op, so it receives
// resolved values and reads no chat table.

import type { ChatId, UserId } from "@orb/kit/ids";
import type { ProseOverrides } from "#prose-slot";
import type { ChatInjection } from "./assemble.ts";
import type { ChatRpgGatherData } from "./rpg-ops.ts";

/** The per-chat knob reads a teaching contribution may branch on. Grows one named field per contribution that
 *  needs one, never a bag, so a new knob is a visible field and not a lookup that resolves undefined. */
export interface TeachingKnobs {
  /** Whether this chat asks the model to offer choices (the standing `:::choices` fence). */
  readonly offerChoices: boolean;
  /** Whether this chat's turns attach the `react` tool. The attach also requires {@link TeachingKnobs.reactionsEnabled}. */
  readonly charactersCanReact: boolean;
  /** The reaction plane's resolved master switch. Off silences the attribution contribution and the react attach. */
  readonly reactionsEnabled: boolean;
}

/** The NAMES a `names-only` macro render binds when a teach slot's host override types `{{user}}`/`{{char}}`.
 *  Chat resolves them once for the whole turn; a contribution never re-derives a protagonist. */
export interface TeachingIdentity {
  /** The active persona's name, or `undefined` when the turn has none. */
  readonly user: string | undefined;
  /** All the seated characters, joined, in a multi-character room; the single character in solo; `""` for an empty roster. */
  readonly char: string;
}

/** The one input a teaching contribution reasons from, assembled once per turn and handed to every contribution.
 *  `runAsUserId` is the turn's frozen host. */
export interface TeachingContext {
  readonly chatId: ChatId;
  readonly runAsUserId: UserId;
  readonly knobs: TeachingKnobs;
  /** The turn preset's composed prose overrides. Required, so a contribution cannot emit different bytes than
   *  another contributor resolving the same slot, which would defeat the double-teach collapse on content. */
  readonly prose: ProseOverrides;
  /** The names a host override's `{{user}}`/`{{char}}` bind to. Required for the same byte-identity reason as `prose`. */
  readonly identity: TeachingIdentity;
  /** This turn's rpg gather, or `null` for a non-game chat or unwired rpg, so a contribution can see what the game
   *  already teaches. It is the same object chat's own contribution projects. */
  readonly rpgGather: ChatRpgGatherData | null;
}

/** What one contribution contributes to a turn. Teach and attach travel together, so the two cannot drift apart. */
export interface TeachingCollection {
  readonly injections: readonly ChatInjection[];
  /** Registry tool names to attach to this turn; an unknown name throws at the tool-use registry. Empty means
   *  the turn is byte-identical to a tool-less one. */
  readonly toolNames: readonly string[];
}

/** One domain's entry in the per-turn teaching collection (D145): registered at the composition root and collected
 *  in `order` (ascending, ties by registration). */
export interface TeachingContribution {
  readonly order: number;
  readonly collect: (tctx: TeachingContext) => Promise<TeachingCollection>;
}
