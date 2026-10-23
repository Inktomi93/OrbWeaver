import type { RpgContext } from "@orb/server/domain/rpg";
import { expectTypeOf, test } from "vitest";

type Path = Parameters<RpgContext["onStateRoundPath"]>[0];
type Identity = Pick<Path, "chatId" | "gameId" | "turnId" | "mode">;
test("folded success cannot report a fallback but an ordinary post-commit round need not have one", () => {
  expectTypeOf<Identity & { path: "folded"; fallbackReason: "no-terminal-calls" }>().not.toExtend<Path>();
  expectTypeOf<Identity & { path: "folded"; fallbackReason: null }>().toExtend<Path>();
  expectTypeOf<Identity & { path: "tool-round"; fallbackReason: null }>().toExtend<Path>();
  expectTypeOf<Identity & { path: "tool-round"; fallbackReason: "no-terminal-calls" }>().toExtend<Path>();
});
