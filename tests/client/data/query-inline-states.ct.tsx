// CT: `<QueryInlineStates>` — the non-suspense pending/error/empty
// status line: pending + empty render in `muted`, error in `destructive`, and a successful non-empty
// read renders nothing (the caller's list shows beneath).
import { QueryInlineStates } from "@orb/client/data";
import { expect, test } from "@playwright/experimental-ct-react";

const COPY = {
  pending: "Loading sessions…",
  error: "Couldn't load the sessions.",
  empty: "No sessions on record.",
} as const;

test("renders the pending copy while the read is pending", async ({ mount }) => {
  const component = await mount(<QueryInlineStates status={{ isPending: true, isError: false, isSuccess: false }} isEmpty={false} {...COPY} />);
  await expect(component.getByText(COPY.pending)).toBeVisible();
});

test("renders the error copy on a failed read", async ({ mount }) => {
  const component = await mount(<QueryInlineStates status={{ isPending: false, isError: true, isSuccess: false }} isEmpty={false} {...COPY} />);
  await expect(component.getByText(COPY.error)).toBeVisible();
});

test("renders the empty copy on a successful read with no rows", async ({ mount }) => {
  const component = await mount(<QueryInlineStates status={{ isPending: false, isError: false, isSuccess: true }} isEmpty={true} {...COPY} />);
  await expect(component.getByText(COPY.empty)).toBeVisible();
});

test("renders nothing on a successful read WITH rows", async ({ mount }) => {
  const component = await mount(<QueryInlineStates status={{ isPending: false, isError: false, isSuccess: true }} isEmpty={false} {...COPY} />);
  await expect(component.getByText(COPY.empty)).toBeHidden();
  await expect(component.getByText(COPY.pending)).toBeHidden();
  await expect(component.getByText(COPY.error)).toBeHidden();
});
