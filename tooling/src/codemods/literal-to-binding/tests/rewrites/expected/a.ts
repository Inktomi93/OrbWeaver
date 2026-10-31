import { other, ROWS } from "./other.ts";
import { contextToggleLabel } from "#client/toggle.ts";
import { channelName } from "#client/channel.ts";
import { renameChatName } from "#client/rename.ts";

type Name = "Show details";
const labels = { "Show details": 1 };
export const names = [contextToggleLabel(true), contextToggleLabel(false), "Keep this"];
export const click = (page: { named: (name: string) => string }): string => page.named(contextToggleLabel(true)) + other + labels[contextToggleLabel(true)];
export const property = channelName("fontScale");
export const unrelated = ROWS.find((row) => row.key === "density")?.name ?? "";
export const renamed = (room: { cast: string; title: string }): string => renameChatName(room.cast, room.title);
export const otherTemplate = (room: { cast: string }): string => `Archive chat — ${room.cast}`;
