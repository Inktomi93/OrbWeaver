import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import {
  ACCOUNTING_AVERAGES_TEXT,
  ACCOUNTING_COVERAGE_NAME,
  ACCOUNTING_IDENTITY_TEXT,
  ACCOUNTING_OMITTED_TEXT,
  ACCOUNTING_PRICES_TEXT,
  ACCOUNTING_RETENTION_TEXT,
  ACCOUNTING_SUMMARY_TEXT,
  accountingScopeText,
} from "../lib/analytics-copy.ts";

/** Keep the accounting boundary visible in each pane; its disclosure carries the complete local explanation. */
export function AccountingCoverageNotice({ characterOnly = false }: { readonly characterOnly?: boolean }): ReactElement {
  return (
    <Stack gap="field" data-slot="accounting-coverage" role="note">
      <Text voice="label">{ACCOUNTING_IDENTITY_TEXT}</Text>
      <Text voice="quiet" cap="prose">
        {ACCOUNTING_SUMMARY_TEXT}
      </Text>
      <Collapsible>
        <CollapsibleTrigger>{ACCOUNTING_COVERAGE_NAME}</CollapsibleTrigger>
        <CollapsiblePanel>
          <Stack gap="field">
            <Text voice="quiet" cap="prose">
              {ACCOUNTING_PRICES_TEXT}
            </Text>
            <Text voice="quiet" cap="prose">
              {ACCOUNTING_OMITTED_TEXT}
            </Text>
            <Text voice="quiet" cap="prose">
              {accountingScopeText(characterOnly)} {ACCOUNTING_RETENTION_TEXT}
            </Text>
            <Text voice="quiet" cap="prose">
              {ACCOUNTING_AVERAGES_TEXT}
            </Text>
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}
