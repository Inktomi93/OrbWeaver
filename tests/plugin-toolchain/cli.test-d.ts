import { expectTypeOf, test } from "vitest";
import type { ParsedSupportArgs } from "#plugin-toolchain/cli.ts";

test("parsed support output is stdout, write, or check, never two destinations", () => {
  type Common = Pick<ParsedSupportArgs, "command" | "format">;
  expectTypeOf<Common & { writePath: string; checkPath: string }>().not.toExtend<ParsedSupportArgs>();
  expectTypeOf<Common & { writePath: undefined; checkPath: undefined }>().toExtend<ParsedSupportArgs>();
  expectTypeOf<Common & { writePath: string; checkPath: undefined }>().toExtend<ParsedSupportArgs>();
  expectTypeOf<Common & { writePath: undefined; checkPath: string }>().toExtend<ParsedSupportArgs>();
});
