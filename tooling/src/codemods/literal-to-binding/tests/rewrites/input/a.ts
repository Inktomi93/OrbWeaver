import { other, ROWS } from "./other.ts";

type Name = "Show details";
const labels = { "Show details": 1 };
export const names = ["Show details", "Hide details", "Keep this"];
export const click = (page: { named: (name: string) => string }): string => page.named("Show details") + other + labels["Show details"];
export const property = ROWS.find((row) => row.key === "fontScale")?.name ?? "";
export const unrelated = ROWS.find((row) => row.key === "density")?.name ?? "";
export const renamed = (room: { cast: string; title: string }): string => `Rename chat — ${room.cast}, ${room.title}`;
export const otherTemplate = (room: { cast: string }): string => `Archive chat — ${room.cast}`;
