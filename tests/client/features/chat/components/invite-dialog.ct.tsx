// CT: the invite MINT dialog (invite-dialog.tsx — FINAL-Chats §8.2). Drives the production path over
// the stubbed network (routeTrpc): `invites.createInvite` (mint), `invites.listInvites` (the FIX #4
// outstanding list), `invites.revokeInvite` (per-row revoke). Proves the two mint modes on the ONE
// §13.4 form factory (share-link → the raw /join link shown ONCE; invite-by-handle → targeted input +
// the coded target-unknown refusal INLINE, never a silent share link), the limits (expiry/max-uses)
// riding the wire, and the outstanding list (status per row; Revoke only on pending).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcFixtureOutput, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { InviteDialogStory } from "../_ct-stories.tsx";

const REVOKE_RE = /Revoke/u;
const MINTED_LINK_RE = /\/join\/tok_ct_minted$/u;

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

const MINT = {
  invite: {
    id: "chatinvite_ct_new",
    chatId: "chat_ct_keystone",
    status: "pending",
    maxUses: null,
    remainingUses: null,
    expiresAt: null,
    invitedUserId: null,
    createdAt: 1,
  },
  token: "tok_ct_minted",
} satisfies TrpcWireOutput<"invites.createInvite">;

function outstanding(): TrpcFixtureOutput<"invites.listInvites"> {
  return [
    {
      id: "chatinvite_ct_a",
      chatId: "chat_ct_keystone",
      status: "pending",
      maxUses: 3,
      remainingUses: 2,
      expiresAt: null,
      invitedUserId: null,
      createdAt: 1,
    },
    {
      id: "chatinvite_ct_b",
      chatId: "chat_ct_keystone",
      status: "revoked",
      maxUses: null,
      remainingUses: null,
      expiresAt: null,
      invitedUserId: "user_frodo",
      createdAt: 2,
    },
  ];
}

test("share-link mode mints and shows the raw /join link ONCE with the copy affordance", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "invites.listInvites": () => [],
    "invites.createInvite": () => MINT,
  });

  await mount(<InviteDialogStory />);
  const dialog = page.getByTestId("invite-dialog");
  await dialog.getByRole("button", { name: "Create link" }).click();

  await expect.poll(() => trpc.count("invites.createInvite"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // An untargeted mint: no invitedHandle on the wire.
  const readInputAtAssertion = async (): Promise<typeof input> =>
    trpc.lastInput("invites.createInvite") as {
      input?: { invitedHandle?: unknown };
    };
  const input = trpc.lastInput("invites.createInvite") as {
    input?: { invitedHandle?: unknown };
  };
  await expect.poll(async () => (await readInputAtAssertion()).input?.invitedHandle).toBeUndefined();

  // The raw link renders ONCE, composed from the returned token, with the you-won't-see-this copy.
  const result = page.getByTestId("invite-link-result");
  await expect(result).toContainText("/join/tok_ct_minted");
  await expect(result.getByText("you won't see this link again", { exact: false })).toBeVisible();
  await expect(page.getByTestId("invite-copy-link")).toBeVisible();
});

test.describe("the automatic copy of a new link", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("writes the new link to the clipboard exactly once", async ({ mount, page }) => {
    await routeTrpc(page, {
      "invites.listInvites": () => [],
      "invites.createInvite": () => MINT,
    });
    await mount(<InviteDialogStory />);
    // Count writes on the document, so the count is readable without a typed global.
    await page.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      let writes = 0;
      navigator.clipboard.writeText = (text: string): Promise<void> => {
        writes += 1;
        document.documentElement.dataset["clipboardWrites"] = String(writes);
        return write(text);
      };
    });
    await page.getByTestId("invite-dialog").getByRole("button", { name: "Create link" }).click();

    await expect(page.getByTestId("invite-link-result")).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(MINTED_LINK_RE);
    await expect(page.locator("html")).toHaveAttribute("data-clipboard-writes", "1");
  });
});

test("a failed automatic copy shows the in-dialog manual-copy field, not a toast behind the backdrop", async ({ mount, page }) => {
  await routeTrpc(page, {
    "invites.listInvites": () => [],
    "invites.createInvite": () => MINT,
  });
  await mount(<InviteDialogStory />);
  // What an insecure (plain http) origin looks like: the [SecureContext] Clipboard API is absent.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: false });
  });
  await page.getByTestId("invite-dialog").getByRole("button", { name: "Create link" }).click();

  const field = page.getByTestId("invite-dialog").getByRole("textbox", { name: "invite link", exact: true });
  await expect(field).toBeVisible();
  await expect(field).toHaveValue(MINTED_LINK_RE);
  // The toast viewport is mounted, so an empty count is a real absence.
  await expect(page.locator('[data-slot="toast-viewport"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
});

test.describe("the outstanding-invite rows at 360px", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("no text overlaps the Revoke button, and every label keeps a width", async ({ mount, page }) => {
    await routeTrpc(page, {
      "invites.listInvites": () => outstanding(),
      "invites.createInvite": () => MINT,
    });
    await mount(<InviteDialogStory />);
    const list = page.getByTestId("invite-outstanding-list");
    await expect(list.getByRole("button", { name: REVOKE_RE })).toHaveCount(1);

    // Every leaf text node in a row that holds a button, with the button's box beside it.
    const readPairs = (): Promise<{ text: string; leaf: Box; target: Box }[]> =>
      list.evaluate((listEl) => {
        const rect = (el: Element): Box => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
        };
        return Array.from(listEl.querySelectorAll("button")).flatMap((button) => {
          let row: Element = button;
          while (row.parentElement !== null && row.parentElement !== listEl) {
            row = row.parentElement;
          }
          const target = rect(button);
          return Array.from(row.querySelectorAll("*"))
            .filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() !== "" && !button.contains(el))
            .map((leaf) => ({ text: leaf.textContent ?? "", leaf: rect(leaf), target }));
        });
      });
    await expect
      .poll(async () => (await readPairs()).filter(({ leaf, target }) => leaf.width < 1 || overlaps(leaf, target)).map(({ text }) => text))
      .toEqual([]);
  });
});

interface RevokeRowGeometry {
  /** The pending row's own width: the box its `@container/list-row` query reads. */
  readonly rowWidth: number;
  /** `--container-cq-sm` resolved to px in this document: the row width where Revoke rejoins the identity line. */
  readonly thresholdPx: number;
  /** Revoke's box starts at or below the identity block's bottom edge. */
  readonly stacked: boolean;
}

/** The pending row's stacking geometry, read against the resolved container token, never a px literal. */
async function revokeRowGeometry(page: Page): Promise<RevokeRowGeometry> {
  const row = page
    .getByTestId("invite-outstanding-list")
    .locator('[data-slot="list-row-root"]')
    .filter({ has: page.getByRole("button", { name: REVOKE_RE }) });
  return await row.evaluate((root): RevokeRowGeometry => {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = "var(--container-cq-sm)";
    document.body.append(probe);
    const thresholdPx = probe.getBoundingClientRect().width;
    probe.remove();
    const body = root.querySelector('[data-slot="list-row-body"]');
    const actions = root.querySelector('[data-slot="list-row-actions"]');
    if (body === null || actions === null) {
      throw new Error("the pending row has no body or actions slot");
    }
    return {
      rowWidth: root.getBoundingClientRect().width,
      thresholdPx,
      stacked: actions.getBoundingClientRect().top >= body.getBoundingClientRect().bottom,
    };
  });
}

// The row stacks by its OWN width against the container token, so the dialog's width decides it. At a desktop
// viewport the dialog gives the row more than `cq-sm` and Revoke sits on the identity line; at 360px the row is
// narrower than `cq-sm` and Revoke takes its own line.
test.describe("the pending row's Revoke at a 1440px viewport", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("stays on the identity line", async ({ mount, page }) => {
    await routeTrpc(page, { "invites.listInvites": () => outstanding() });
    await mount(<InviteDialogStory />);
    await expect(page.getByTestId("invite-outstanding-list").getByRole("button", { name: REVOKE_RE })).toBeVisible();
    const geometry = await revokeRowGeometry(page);
    expect(geometry.thresholdPx).toBeGreaterThan(0);
    expect(geometry.rowWidth).toBeGreaterThanOrEqual(geometry.thresholdPx);
    expect(geometry.stacked, "a desktop-width invite row keeps Revoke beside its label").toBe(false);
  });
});

test.describe("the pending row's Revoke at a 360px viewport", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("takes its own line", async ({ mount, page }) => {
    await routeTrpc(page, { "invites.listInvites": () => outstanding() });
    await mount(<InviteDialogStory />);
    await expect(page.getByTestId("invite-outstanding-list").getByRole("button", { name: REVOKE_RE })).toBeVisible();
    const geometry = await revokeRowGeometry(page);
    expect(geometry.thresholdPx).toBeGreaterThan(0);
    expect(geometry.rowWidth).toBeLessThan(geometry.thresholdPx);
    expect(geometry.stacked, "a phone-width invite row puts Revoke on its own line").toBe(true);
  });
});

test("handle mode sends the targeted invite with the limits on the wire", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "invites.listInvites": () => [],
    "invites.createInvite": () => MINT,
  });

  await mount(<InviteDialogStory />);
  const dialog = page.getByTestId("invite-dialog");
  await dialog.getByRole("button", { name: "Invite by handle" }).click();
  await dialog.getByLabel("Handle").fill("frodo");
  await dialog.getByRole("textbox", { name: "Max uses" }).fill("3");
  await dialog.getByRole("button", { name: "Send invite" }).click();

  await expect.poll(() => trpc.count("invites.createInvite"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const readInputAtAssertion = async (): Promise<typeof input> =>
    trpc.lastInput("invites.createInvite") as {
      input?: { invitedHandle?: unknown; maxUses?: unknown };
    };
  const input = trpc.lastInput("invites.createInvite") as {
    input?: { invitedHandle?: unknown; maxUses?: unknown };
  };
  await expect.poll(async () => (await readInputAtAssertion()).input?.invitedHandle).toBe("frodo");
  await expect.poll(async () => (await readInputAtAssertion()).input?.maxUses).toBe(3);
});

test("an unknown handle renders the coded refusal INLINE — never a silent share link", async ({ mount, page }) => {
  await routeTrpc(page, {
    "invites.listInvites": () => [],
    // The verb's invite_target_unknown maps to BAD_REQUEST at transport (error-mapping.ts).
    "invites.createInvite": () => trpcError({ code: "BAD_REQUEST", message: "no invitable user with that handle" }),
  });

  await mount(<InviteDialogStory />);
  const dialog = page.getByTestId("invite-dialog");
  await dialog.getByRole("button", { name: "Invite by handle" }).click();
  await dialog.getByLabel("Handle").fill("ghost");
  await dialog.getByRole("button", { name: "Send invite" }).click();

  await expect(dialog.getByRole("alert")).toHaveText("No invitable user with that exact handle.");
  // No link result appears — the refusal never degrades to a share link (§8.2).
  await expect(page.getByTestId("invite-link-result")).toHaveCount(0);
});

test("an empty handle is a field validation error (no wire call)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "invites.listInvites": () => [],
    "invites.createInvite": () => MINT,
  });

  await mount(<InviteDialogStory />);
  const dialog = page.getByTestId("invite-dialog");
  await dialog.getByRole("button", { name: "Invite by handle" }).click();
  await dialog.getByRole("button", { name: "Send invite" }).click();

  await expect(dialog.getByText("Enter their exact handle.")).toBeVisible();
  await expect.poll(() => trpc.count("invites.createInvite")).toBe(0);
});

test("the outstanding list renders per-invite status/uses and revokes a pending invite", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "invites.listInvites": () => outstanding(),
    "invites.revokeInvite": () => null,
  });

  await mount(<InviteDialogStory />);
  const list = page.getByTestId("invite-outstanding-list");
  await expect(list.getByText("pending", { exact: true })).toBeVisible();
  await expect(list.getByText("revoked", { exact: true })).toBeVisible();
  await expect(list.getByText("2 of 3 uses left", { exact: false })).toBeVisible();
  await expect(list.getByText("Targeted invite", { exact: true })).toBeVisible();

  // Revoke renders ONLY on the pending row, and fires the verb with the invite id.
  const revokes = list.getByRole("button", { name: REVOKE_RE });
  await expect(revokes).toHaveCount(1);
  await revokes.click();
  await expect.poll(() => trpc.count("invites.revokeInvite"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  const readInputAtAssertion = async (): Promise<typeof input> => trpc.lastInput("invites.revokeInvite") as { inviteId?: unknown };
  const input = trpc.lastInput("invites.revokeInvite") as { inviteId?: unknown };
  await expect.poll(async () => (await readInputAtAssertion()).inviteId).toBe("chatinvite_ct_a");
});
