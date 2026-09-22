// The modality axis — ONE closed tuple every capability's `input`/`output` and every task's `requires`
// clause is spelled in. Replaces today's `input.{vision, video, audio, file}` booleans and the free
// `inputModalities: string[]` a catalog hands over: a modality is a MEMBER, never a flag per consumer.
// `vector` is emitted by no catalog — it exists only as an embedding capability's `output`.

import { z } from "zod";

export const MODALITIES = ["text", "image", "video", "audio", "file", "vector"] as const;
export type Modality = (typeof MODALITIES)[number];
export const modalitySchema = z.enum(MODALITIES) satisfies z.ZodType<Modality>;

const MODALITY_SET: ReadonlySet<string> = new Set<string>(MODALITIES);

/** Parse a catalog's free modality strings into members, DROPPING what it does not know and saying so.
 *  A catalog (OpenRouter stores `architecture.inputModalities.map(String)`) can grow a word tomorrow; the
 *  unknown-value rule is a parse OUTCOME — `estimated: true` — never a throw and never a silent `Set.has`
 *  miss (D41). */
export function parseModalities(raw: readonly string[] | undefined): { readonly modalities: readonly Modality[]; readonly estimated: boolean } {
  if (raw === undefined) {
    return { modalities: [], estimated: true };
  }
  const known: Modality[] = [];
  let estimated = false;
  for (const value of raw) {
    if (MODALITY_SET.has(value)) {
      known.push(value as Modality);
    } else {
      estimated = true;
    }
  }
  return { modalities: known, estimated };
}
