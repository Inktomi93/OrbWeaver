import { z } from "zod";
import { readMember } from "./floor/instrument/member.ts";

export function parse(value: object): string | null {
  const mode = readMember(value, "mode");
  const nested = readMember(value.constructor, Symbol.iterator);
  return typeof mode === "string" && nested === undefined ? z.string().parse(mode) : null;
}
