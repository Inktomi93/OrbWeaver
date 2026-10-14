/** The physical library loader, not model-cache, admission or output policy. */
export type LoadTransformersKernel = () => Promise<typeof import("@huggingface/transformers")>;

/** Trusted execution module loaded within one owned worker; its native loader stays with inference. */
export interface LocalLightKernelModule {
  readonly fetch: typeof fetch;
  readonly loadTransformers: (nativeLoad: LoadTransformersKernel) => ReturnType<LoadTransformersKernel>;
}
