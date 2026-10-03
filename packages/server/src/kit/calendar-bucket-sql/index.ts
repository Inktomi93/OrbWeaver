// @orb/server/kit/calendar-bucket-sql — the SQL twin of `@orb/kit/time.calendarBucketStart`: every aggregate read
// that ships UTC calendar buckets for the client's viewer-calendar fold floors its epoch-ms instant here.

import { CALENDAR_BUCKET_MS } from "@orb/kit/time";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** The start (epoch-ms) of the calendar bucket an epoch-ms instant column or expression falls in. */
export function calendarBucketStartSql(instantMs: SQLWrapper): SQL<number> {
  // The CAST keeps the division integral whatever numeric type the driver binds the width as.
  return sql<number>`CAST(${instantMs} / ${CALENDAR_BUCKET_MS} AS INTEGER) * ${CALENDAR_BUCKET_MS}`;
}
