// schema/relations — drizzle `relations()` for the relational query API (`db.query.*.findMany({ with })`).
// CONSUMER-DRIVEN: relations are runtime-only metadata (NOT DDL — adding one is never a migration, and the
// real referential integrity is the `.references()` FKs in each table file). The FK graph is already
// complete in the table files; this file grows lazily, per-join, when a consumer exists.
//
// RESERVED SEAM (owner-ruled 2026-08-03, kept over deletion): the persistence layer standardized on
// explicit select+join (~167 joins / 38 files) — that stays the read dialect for flat/aggregate reads.
// The ANTICIPATED consumers of THIS seam are the deep NESTED-TREE read class: databank document trees,
// export/portability bundles (chat → messages → variants → attachments; character → chats → games), and
// deep nested searches — entity-graph assembly, RQB's actual sweet spot. Explicitly NOT for
// analytics/stats aggregates (GROUP BY / computed projections stay explicit SQL — RQB cannot express
// them). When the first nested-tree consumer lands, grow the needed `relations(...)` rows here and adopt
// `db.query` for THAT read only — two dialects, split by read SHAPE (tree vs flat), each cited.

import { relations } from "drizzle-orm";
import { users } from "./users.ts";

// The owner root. KEPT deliberately (owner ruling 2026-08-03) — see the header: relations are CONSUMER-DRIVEN
// runtime metadata handed to drizzle wholesale as `drizzle(client, { schema })`, so no code will ever name it.
// @swallowed-ok: the `#schema` namespace is passed WHOLESALE to drizzle, which reads the relations config it is
// handed; the users root is the anchor this file grows from, per the header's consumer-driven law.
export const usersRelations = relations(users, () => ({}));
