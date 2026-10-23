import { castId } from "./ids.ts";

export const userId = castId<"UserId">("user_1");
export const api = { castId };
