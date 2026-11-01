import { z } from "zod";

export function parse(value: object): string | null {
  const mode = Reflect.get(value, "mode");
  const nested = Reflect.get(value.constructor, Symbol.iterator);
  return typeof mode === "string" && nested === undefined ? z.string().parse(mode) : null;
}
