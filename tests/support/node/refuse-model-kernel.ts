/** Refuse an unscripted physical model load before importing its native library or downloading weights. */
export function loadTransformers(): Promise<never> {
  return Promise.reject(new Error("server harness: unscripted external model execution"));
}

/** Refuse an unscripted Hub or head-file request; no ambient fetch is inherited by a scripted worker. */
export function fetch(): Promise<never> {
  return Promise.reject(new Error("server harness: unscripted external model file request"));
}
