// The bank's ONE census read, in two shapes. Its own module since #1676 because it now has TWO readers: the
// LIST chrome band (`hooks/use-databank-list-header.tsx`) and the phone topbar's screen title
// (`lib/databank-selection-title.ts`), which is where the count lives once the ONE-NAME rule (shell.css) sheds
// the band's title. One query key, so the second reader costs no request.
//
// THE COUNT IS THE SERVER'S CENSUS (`databank.bankHealth.total`, 2026-08-14) — a non-suspending read, so a
// band renders immediately and stays put while it settles. A COUNT read for a count: it fetches no rows at
// all, where the band used to ask for a hundred documents to measure the length of the list. It is
// deliberately not the pane's own read — the pane's rows live in an infinite query keyed per page size, and a
// count that grew as you scrolled would report how far you have got, not how big your bank is.

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc, TrpcReadError } from "#data";
import { useTRPC } from "#data";

type BankHealth = inferOutput<Trpc["databank"]["bankHealth"]>;

/** The bank-health read WHOLE — the band needs its failure/refetch arms to say why a sweep is closed. */
export function useDatabankBankHealth(): UseQueryResult<BankHealth, TrpcReadError> {
  const trpc = useTRPC();
  return useQuery(trpc.databank.bankHealth.queryOptions());
}

/** Just the number, in ONE spelling. `undefined` = unread OR failed — an honest absence, and the state in
 *  which no reader prints a count and the owner-wide sweeps stay closed (#1500). */
export function useDatabankCensus(): number | undefined {
  return useDatabankBankHealth().data?.total;
}
