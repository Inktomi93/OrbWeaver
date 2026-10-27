// Raw capture data is independent of both procedure vocabulary and admitted playback.
/** Portable request presence and its captured response travel together. */
export interface CorpusCapture<Input, Output> {
  readonly input: Input;
  readonly output: Output;
}
