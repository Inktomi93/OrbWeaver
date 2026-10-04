// The extractor-upgrade banner at the head of the databank list: present only while the bank census counts
// documents an owner-wide re-extract would rewrite, and its one action is that sweep, behind the same confirm
// the maintenance kebab opens. The count drops as the sweep's ingest terminals land on the user bus.

import { Button } from "@orb/ui/button";
import { Icon, RefreshCw } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useDatabankBankHealth } from "../hooks/use-databank-census.ts";
import { useOwnerSweep } from "../hooks/use-owner-sweep.tsx";
import { staleExtractionLine } from "../lib/databank-model.ts";

export function ReExtractBanner(): ReactElement | null {
  const stale = useDatabankBankHealth().data?.staleExtraction ?? 0;
  const sweep = useOwnerSweep();
  if (stale === 0) {
    return null;
  }
  return (
    <>
      <Row align="center" data-slot="databank-re-extract-banner" gap="row" justify="between" role="status">
        <Text className="min-w-0" voice="gloss">
          {staleExtractionLine(stale)}
        </Text>
        <Button className="shrink-0" disabled={sweep.pending} intent="secondary" onClick={(): void => sweep.ask("re-extract")} size="sm" type="button">
          <Icon icon={RefreshCw} size="sm" />
          Re-read
        </Button>
      </Row>
      {sweep.confirm}
    </>
  );
}
