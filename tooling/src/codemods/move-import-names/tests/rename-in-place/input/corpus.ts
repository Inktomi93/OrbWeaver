import type { seedStats as produceStats } from "./factories/rows/stats.ts";
import { seedStats } from "./factories/rows/stats.ts";

type Produced = Awaited<ReturnType<typeof produceStats>>;

export async function publish(root: Root): Promise<Produced> {
  const first = await seedStats(root, root.ownerId);
  const { seedStats: late } = await import("./factories/rows/stats.ts");
  return first ?? (await late(root, root.ownerId));
}

export async function lazy(root: Root): Promise<Produced> {
  const { seedStats } = await import("./factories/rows/stats.ts");
  const { seedOther } = await import("./factories/rows/other.ts");
  await seedOther(root);
  return await seedStats(root, root.ownerId);
}
