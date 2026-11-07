import { tv } from "#lib";

type Layout = "flex flex-col gap-field";

export const KEYED = { "flex flex-col gap-field": 1 } as const;

export const a = tv({
  slots: {
    scattered: "flex items-center flex-col p-field gap-field",
    partial: "flex flex-col gap-row",
    variant: "hover:flex flex-col gap-field",
    escaped: "flex flex-col gap-field \\n",
  },
});

export function same(value: string): boolean {
  return value === "flex flex-col gap-field";
}

export type { Layout };
