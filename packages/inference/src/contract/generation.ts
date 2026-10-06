// Image output shared by standalone image generation and inline chat completions.

export interface GeneratedImage {
  /** Relative tool/file part order in the original completion, before the result arrays split it. */
  readonly partOrdinal?: number | undefined;
  readonly thoughtSignature?: string | undefined;
  readonly url: string | undefined;
  readonly base64: string | undefined;
  readonly mediaType: string | undefined;
  /** §6.7 INLINE REPLY ONLY — the character offset in the completion's accumulated REPLY TEXT at which this
   *  picture arrived, so the chat reducer can splice its `![alt](asset:id)` span where the model put it
   *  rather than piling every picture at the tail. Absent on the `/imagine` path, which has no prose to
   *  interleave with. A HINT, not a guarantee: the domain's receive tier (regex scripts, the `<think>` demux)
   *  may rewrite those bytes before the splice, so the consumer clamps. */
  readonly atChars?: number | undefined;
}
