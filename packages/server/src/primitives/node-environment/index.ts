/** Node execution environments admitted by app boot and the plugin broker. The explicit tuple annotation is
 *  the public boundary the cross-tier placement rule reads; tsc fails if it and the literal drift apart. */
export const NODE_ENVIRONMENTS: readonly ["development", "production", "test"] = ["development", "production", "test"];

/** An admitted Node execution environment. */
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];
