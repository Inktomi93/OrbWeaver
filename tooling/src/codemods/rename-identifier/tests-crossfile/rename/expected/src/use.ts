import { brandId } from "./ids.ts";

export const userId = brandId<"UserId">("user_1");
export const api = { castId: brandId };
