import { other, ROWS } from "./other.ts";
import { contextToggleLabel } from "#client/toggle.ts";
import { channelName } from "#client/channel.ts";

type Name = "Show details";
const labels = { "Show details": 1 };
export const names = [contextToggleLabel(true), contextToggleLabel(false), "Keep this"];
export const click = (page: { named: (name: string) => string }): string => page.named(contextToggleLabel(true)) + other + labels[contextToggleLabel(true)];
export const property = channelName("fontScale");
export const unrelated = ROWS.find((row) => row.key === "density")?.name ?? "";
