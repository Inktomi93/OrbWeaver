import type { seedUserCredential as produceCredential } from "./rows.ts";
import { seedUserCredential } from "./rows.ts";

export type Credential = Awaited<ReturnType<typeof produceCredential>>;

export async function direct(): Promise<string> {
  return await seedUserCredential("direct");
}

export async function late(): Promise<string> {
  const { seedUserCredential } = await import("./rows.ts");
  return await seedUserCredential("late");
}
