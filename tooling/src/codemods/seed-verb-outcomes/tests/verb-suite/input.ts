test("verb suite reads seed outcomes", async () => {
  const installed = await seedInstalledPlugin(root, { caller, bundle, grant: [] });
  const enabled = await seedPluginGrant(root, { caller, pluginId: installed.plugin.id, grant });
  await root.services.plugin.setEnabled({ caller, pluginId: enabled.plugin.id, enabled: true });
  // A column read off the old row is hand work; the codemod leaves it.
  expect(installed.plugin.status).toBe("disabled");
  const invite = await seedChatInvite(root, { principal, chatId });
  await root.services.chat.acceptInvite({ principal: guest, inviteId: invite.id });
  const { row: card } = await seedCharacter(root, { principal, input });
  const { row: room, extra } = await seedChat(root, { principal, characterIds: [card.id] });
  const { slot: message } = await seedMessage(root, { principal, chatId: room.id });
  expect(message.id).toBeDefined();
  // An unrelated binding with the same member shape stays.
  const other = await somethingElse();
  expect(other.plugin.id).toBeDefined();
});
