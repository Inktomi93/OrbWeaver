import type { Row } from "../contract/rows.ts";
import { helper } from "./helper.ts";

// Names "./io.ts" only in text, which no specifier rewrite touches.
export const pureRule = (row: Row | undefined): Row | undefined => helper(row);
