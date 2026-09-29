/** Node execution environments admitted by app boot and the plugin broker. */
export const NODE_ENVIRONMENTS = ["development", "production", "test"] as const;

/** An admitted Node execution environment. */
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];
