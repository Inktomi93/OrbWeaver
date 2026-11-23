// The member findings split the way every unwired scan splits its rows: a member the deliberate list names reports apart
// with its reason, a row an open board item owns reports apart with that item, and a judged entry whose row is gone or
// whose item is closed is stale. A row's key is the fields scan's `file:Home.member`, so one judged list serves both.
import type { DeliberateEntry } from "../deliberate.ts";
import type { JudgedEntry, JudgedSplit } from "../judged.ts";
import { sortRows } from "../scan.ts";
import type { Analysis, MemberBucket } from "./analyse.ts";
import { MEMBER_BUCKETS, memberHome } from "./analyse.ts";
import type { Graph } from "./build.ts";
import { isDeclKey } from "./sites.ts";

/** The lists a member row is judged by. */
export interface MemberRulings {
  readonly deliberate: readonly DeliberateEntry[];
  readonly judged: readonly JudgedEntry[];
}

/** No ruling: every member row reports as unwired. */
export const NO_RULINGS: MemberRulings = { deliberate: [], judged: [] };

/** One member finding as a row the lists can name. */
interface MemberRow {
  readonly key: string;
  readonly bucket: MemberBucket;
  readonly file: string;
  readonly home: string;
  readonly member: string;
  readonly note: string | null;
}

/** The member rows split by the deliberate and judged lists. */
export type JudgedMembers = JudgedSplit<MemberRow> & { readonly deliberate: readonly (MemberRow & { readonly reason: string })[] };

/** Split the member buckets of `analysis` by `rulings`, reading which items are open from `root`'s docs/work. */
export function judgeMembers(root: string, graph: Graph, analysis: Analysis, rulings: MemberRulings): JudgedMembers {
  const { decls } = graph.facts;
  const rows = MEMBER_BUCKETS.flatMap((bucket) =>
    analysis[bucket].map(({ key, label, note }): MemberRow => {
      // analyse.ts files a member finding under its own declaration's key
      const info = key !== null && isDeclKey(key) ? decls.get(key) : undefined;
      if (info === undefined) {
        throw new Error(`member finding ${label} names no declaration`);
      }
      const home = memberHome(decls, info.holder);
      return { key: `${info.file}:${home}.${info.name}`, bucket, file: info.file, home, member: info.name, note };
    }),
  );
  return sortRows(rows, { root, ...rulings });
}
