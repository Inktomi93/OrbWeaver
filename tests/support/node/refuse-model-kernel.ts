/** Refuse an unscripted physical model load before importing its native library or downloading weights. @public Loaded by URL at runtime as a kernel entry; no static import reaches it. */
export function loadTransformers(): Promise<never> {
  return Promise.reject(new Error("server harness: unscripted external model execution"));
}

/** Refuse an unscripted Hub or head-file request; no ambient fetch is inherited by a scripted worker. @public Loaded by URL at runtime as a kernel entry; no static import reaches it. */
export function fetch(): Promise<never> {
  return Promise.reject(new Error("server harness: unscripted external model file request"));
}
