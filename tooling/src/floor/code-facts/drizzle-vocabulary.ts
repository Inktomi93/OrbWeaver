// The Drizzle builder, SQL-export and row-model member names every reader keys on. A name is a syntactic
// candidate only; declaration identity and each consumer's verb selection stay with the reader that judges it.

export const DRIZZLE_SELECT_VERB = "select";
export const DRIZZLE_SELECT_VERBS = [DRIZZLE_SELECT_VERB, "selectDistinct"] as const;
export const DRIZZLE_FROM_VERB = "from";
export const DRIZZLE_WHERE_VERB = "where";
/** The one join whose ON condition filters every row of the statement. */
export const DRIZZLE_INNER_JOIN_VERB = "innerJoin";
export const DRIZZLE_JOIN_VERBS = [DRIZZLE_INNER_JOIN_VERB, "leftJoin", "rightJoin", "fullJoin", "crossJoin"] as const;
/** `db.with(cte)` opens a statement; `db.$with(name)` declares the CTE it reads. */
export const DRIZZLE_WITH_VERB = "with";
export const DRIZZLE_CTE_VERB = "$with";
export const DRIZZLE_DYNAMIC_VERB = "$dynamic";
/** `.as(name)` turns a select into a subquery or an aliased SQL value. */
export const DRIZZLE_ALIAS_VERB = "as";
/** The execute verb whose result is one row rather than an array. */
export const DRIZZLE_SINGLE_ROW_VERB = "get";
/** The execute verbs a client also accepts with a raw statement argument: `db.run(sql…)`, `db.execute(sql…)`. */
export const DRIZZLE_STATEMENT_EXECUTE_VERBS = ["run", "execute"] as const;
export const DRIZZLE_EXECUTE_VERBS = ["all", DRIZZLE_SINGLE_ROW_VERB, ...DRIZZLE_STATEMENT_EXECUTE_VERBS] as const;
export const DRIZZLE_BATCH_VERB = "batch";

export const DRIZZLE_INSERT_VERB = "insert";
export const DRIZZLE_UPDATE_VERB = "update";
export const DRIZZLE_DELETE_VERB = "delete";
export const DRIZZLE_MUTATION_VERBS = [DRIZZLE_INSERT_VERB, DRIZZLE_UPDATE_VERB, DRIZZLE_DELETE_VERB] as const;
/** The mutation verbs that choose a table and write columns; `delete` names a table but writes none. */
export const DRIZZLE_WRITE_ROOT_VERBS = [DRIZZLE_UPDATE_VERB, DRIZZLE_INSERT_VERB] as const;
export type DrizzleWriteRootVerb = (typeof DRIZZLE_WRITE_ROOT_VERBS)[number];
export const DRIZZLE_VALUES_VERB = "values";
export const DRIZZLE_SET_VERB = "set";
/** The builder calls whose first argument names the written columns. */
export const DRIZZLE_WRITE_ARGUMENT_VERBS = [DRIZZLE_VALUES_VERB, DRIZZLE_SET_VERB] as const;
export const DRIZZLE_UPSERT_VERB = "onConflictDoUpdate";
export const DRIZZLE_CONFLICT_VERBS = [DRIZZLE_UPSERT_VERB, "onConflictDoNothing"] as const;
/** The upsert config property that carries the written columns. */
export const DRIZZLE_UPSERT_SET_KEY = "set";
export const DRIZZLE_RETURNING_VERB = "returning";

export const DRIZZLE_RELATIONAL_ROOT = "query";
export const DRIZZLE_RELATIONAL_VERBS = ["findFirst", "findMany"] as const;

export const DRIZZLE_SQL_EXPORT = "sql";
export const DRIZZLE_SQL_RAW_MEMBER = "raw";

export const DRIZZLE_SELECT_ROW_MODEL = "$inferSelect";
export const DRIZZLE_INSERT_ROW_MODEL = "$inferInsert";
export const DRIZZLE_ROW_MODELS = [DRIZZLE_SELECT_ROW_MODEL, DRIZZLE_INSERT_ROW_MODEL] as const;
export type DrizzleRowModel = (typeof DRIZZLE_ROW_MODELS)[number];
