import type { ChatId, PluginId, PresetId } from "@orb/kit/ids";
import type { MacroSourceKind, MacroSourceOf, MacroSourceRef } from "@orb/kit/macro";
import { createDefaultRegistry, registerUserMacros } from "@orb/kit/macro";
import { expectTypeOf, test } from "vitest";

declare const chatId: ChatId;
declare const pluginId: PluginId;
declare const presetId: PresetId;

test("each source kind carries its own brand", () => {
  expectTypeOf<MacroSourceOf<"preset">>().toEqualTypeOf<{ readonly kind: "preset"; readonly id: PresetId | null }>();
  expectTypeOf<MacroSourceOf<"game">>().toEqualTypeOf<{ readonly kind: "game"; readonly id: ChatId }>();
  expectTypeOf<MacroSourceOf<"plugin">>().toEqualTypeOf<{ readonly kind: "plugin"; readonly id: PluginId }>();
  expectTypeOf<MacroSourceRef["kind"]>().toEqualTypeOf<MacroSourceKind>();
});

test("a chat id cannot stand in for a plugin id", () => {
  // @ts-expect-error a plugin source names a plugin, never the chat it ran in
  const fresh: MacroSourceRef = { kind: "plugin", id: chatId };
  // A non-fresh object skips the excess-property check, so the brand itself has to refuse it.
  const loose = { kind: "plugin", id: chatId } as const;
  // @ts-expect-error the id brand is checked on a variable too
  const widened: MacroSourceRef = loose;
  // @ts-expect-error the register door takes the same union
  registerUserMacros(createDefaultRegistry(), [], { source: loose });
  // @ts-expect-error a game source is keyed by the game's chat id, not a preset id
  const game: MacroSourceRef = { kind: "game", id: presetId };
  // @ts-expect-error the id cannot be dropped
  const missing: MacroSourceRef = { kind: "plugin" };
  expectTypeOf(pluginId).toEqualTypeOf<MacroSourceOf<"plugin">["id"]>();
  expectTypeOf([fresh, widened, game, missing]).toEqualTypeOf<MacroSourceRef[]>();
});
