// channelName reads the production manifest's row for a key, so a spec never spells a channel by hand.

import { describe, expect, test } from "vitest";
import { APPEARANCE_CHANNEL_ROWS } from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import { channelName } from "./appearance-channel-name.ts";

describe("channelName", () => {
  test("names every manifest row by its own channel", () => {
    for (const row of APPEARANCE_CHANNEL_ROWS) {
      expect(channelName(row.key)).toBe(row.name);
    }
    expect(APPEARANCE_CHANNEL_ROWS.length).toBeGreaterThan(0);
  });

  test("names the font-scale channel as a custom property", () => {
    expect(channelName("fontScale")).toMatch(/^--/u);
  });
});
