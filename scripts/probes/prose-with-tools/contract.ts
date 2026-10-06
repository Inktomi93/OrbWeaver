const SHAPES = ["both", "prose-only", "tools-only", "empty"] as const;
export type Shape = (typeof SHAPES)[number];
