import type { OpenAiBackend } from "../../contract/openai-backend.ts";
import { HttpError } from '../../contract/http.ts';
import { deps } from "../../../src/deps.ts";
import { stream } from "../shared/stream.ts";
import { local } from "./local.ts";
export { WireFrame } from "../../contract/wire.ts";
export type { V4 } from "../../contract/v4.ts";

export async function load(): Promise<unknown> {
  return import("../../contract/runtime.ts");
}

// A string that is not a module specifier stays as written.
export const label = "../../contract/http.ts";
export type Value = OpenAiBackend | typeof HttpError | typeof deps | typeof stream | typeof local;
