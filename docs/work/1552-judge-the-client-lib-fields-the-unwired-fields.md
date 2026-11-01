---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/lib fields the unwired fields scan reports: agent-bridge to motion-flaggers

## What

`pnpm unwired fields` reports each of the fields below in `client/lib`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `OrbRingMetadata.name` | `client/src/lib/agent-bridge.ts:50` | unreferenced | delete | delete the field |
| `OrbRingMetadata.read` | `client/src/lib/agent-bridge.ts:51` | never-read | delete | delete the field and its writes (`client/src/lib/agent-bridge.ts:168`) |
| `OrbRingMetadata.resettable` | `client/src/lib/agent-bridge.ts:53` | never-read | delete | delete the field and its writes (`client/src/lib/agent-bridge.ts:168`) |
| `OrbRingMetadata.description` | `client/src/lib/agent-bridge.ts:54` | never-read | delete | delete the field and its writes (`client/src/lib/agent-bridge.ts:168`) |
| `AppearanceMessageRegistryReceipt.mounted` | `client/src/lib/agent-bridge-appearance.ts:10` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageRegistryReceipt.registered` | `client/src/lib/agent-bridge-appearance.ts:11` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageRegistryReceipt.matched` | `client/src/lib/agent-bridge-appearance.ts:12` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageRegistryReceipt.missingIds` | `client/src/lib/agent-bridge-appearance.ts:13` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageRegistryReceipt.staleIds` | `client/src/lib/agent-bridge-appearance.ts:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixBridgeContract.rows` | `client/src/lib/agent-bridge-appearance.ts:18` | never-read | delete | delete the field and its writes (`client/src/lib/agent-bridge-appearance.ts:48`) |
| `AppearanceMatrixBridgeContract.messageRegistry` | `client/src/lib/agent-bridge-appearance.ts:19` | never-read | delete | delete the field and its writes (`client/src/lib/agent-bridge-appearance.ts:57`) |
| `QuerySummary.key` | `client/src/lib/agent-bridge-handles.ts:9` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `QuerySummary.status` | `client/src/lib/agent-bridge-handles.ts:10` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `QuerySummary.fetch` | `client/src/lib/agent-bridge-handles.ts:11` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `QuerySummary.stale` | `client/src/lib/agent-bridge-handles.ts:12` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShellSnapshot.section` | `client/src/lib/agent-bridge-handles.ts:17` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShellSnapshot.panels` | `client/src/lib/agent-bridge-handles.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShellSnapshot.chatOpen` | `client/src/lib/agent-bridge-handles.ts:23` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.sections` | `client/src/lib/agent-bridge-handles.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.corpusModes` | `client/src/lib/agent-bridge-handles.ts:31` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.modalSlots` | `client/src/lib/agent-bridge-handles.ts:32` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.configGroups` | `client/src/lib/agent-bridge-handles.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.contextTabs` | `client/src/lib/agent-bridge-handles.ts:34` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.contextTabNames` | `client/src/lib/agent-bridge-handles.ts:35` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.contextTabsPublished` | `client/src/lib/agent-bridge-handles.ts:36` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbNavCapabilities.chatPositions` | `client/src/lib/agent-bridge-handles.ts:37` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbRpgSnapshot.chatId` | `client/src/lib/agent-bridge-handles.ts:49` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbRpgSnapshot.game` | `client/src/lib/agent-bridge-handles.ts:50` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbRpgSnapshot.tracker` | `client/src/lib/agent-bridge-handles.ts:51` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbRpgSnapshot.journal` | `client/src/lib/agent-bridge-handles.ts:52` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbRpgSnapshot.turnToolCalls` | `client/src/lib/agent-bridge-handles.ts:53` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbPluginLogLine.level` | `client/src/lib/agent-plugin-bridge.ts:11` | unreferenced | delete | delete the field |
| `OrbPluginLogLine.message` | `client/src/lib/agent-plugin-bridge.ts:12` | unreferenced | delete | delete the field |
| `OrbPluginLogLine.at` | `client/src/lib/agent-plugin-bridge.ts:13` | unreferenced | delete | delete the field |
| `OrbPluginPublication.chatId` | `client/src/lib/agent-plugin-bridge.ts:30` | unreferenced | delete | delete the field |
| `OrbPluginPublication.status` | `client/src/lib/agent-plugin-bridge.ts:31` | unreferenced | delete | delete the field |
| `OrbPluginPublication.fetchStatus` | `client/src/lib/agent-plugin-bridge.ts:32` | unreferenced | delete | delete the field |
| `OrbPluginPublication.published` | `client/src/lib/agent-plugin-bridge.ts:33` | unreferenced | delete | delete the field |
| `OrbPluginPublication.updatedAt` | `client/src/lib/agent-plugin-bridge.ts:34` | unreferenced | delete | delete the field |
| `OrbPluginUiHost.visible` | `client/src/lib/agent-plugin-bridge.ts:39` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbPluginUiHost.inert` | `client/src/lib/agent-plugin-bridge.ts:40` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbPluginUiHost.ariaHidden` | `client/src/lib/agent-plugin-bridge.ts:41` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbPluginUiHost.selector` | `client/src/lib/agent-plugin-bridge.ts:42` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbPluginUiHost.index` | `client/src/lib/agent-plugin-bridge.ts:43` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OrbPluginUiSurface.publication` | `client/src/lib/agent-plugin-bridge.ts:47` | unreferenced | delete | delete the field |
| `OrbPluginUiSurface.hosts` | `client/src/lib/agent-plugin-bridge.ts:48` | unreferenced | delete | delete the field |
| `OrbPluginUiCommand.hosts` | `client/src/lib/agent-plugin-bridge.ts:52` | unreferenced | delete | delete the field |
| `OrbPluginUiCommand.menuHosts` | `client/src/lib/agent-plugin-bridge.ts:56` | unreferenced | delete | delete the field |
| `OrbPluginUiEntry.surfaces` | `client/src/lib/agent-plugin-bridge.ts:60` | unreferenced | delete | delete the field |
| `OrbPluginUiEntry.commands` | `client/src/lib/agent-plugin-bridge.ts:61` | unreferenced | delete | delete the field |
| `OrbPluginUiSnapshot.chatId` | `client/src/lib/agent-plugin-bridge.ts:66` | never-read | delete | delete the field and its writes (`client/src/dev/agent-plugin/ui.ts:83`) |
| `OrbPluginUiSnapshot.plugins` | `client/src/lib/agent-plugin-bridge.ts:67` | never-read | delete | delete the field and its writes (`client/src/dev/agent-plugin/ui.ts:84`) |
| `AppearanceConsumerBinding.file` | `client/src/lib/appearance-carrier-manifest.ts:30` | unreferenced | delete | delete the field |
| `AppearanceConsumerBinding.symbol` | `client/src/lib/appearance-carrier-manifest.ts:31` | unreferenced | delete | delete the field |
| `ThemeCarrierObservable.lifecycle` | `client/src/lib/appearance-carrier-manifest.ts:403` | never-read | delete | delete the field and its writes (`client/src/lib/appearance-carrier-manifest.ts:411`) |
| `AppearanceMatrixContractRow.key` | `client/src/lib/appearance-carrier-manifest.ts:429` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContractRow.owner` | `client/src/lib/appearance-carrier-manifest.ts:430` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContractRow.carriers` | `client/src/lib/appearance-carrier-manifest.ts:431` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContractRow.consumer` | `client/src/lib/appearance-carrier-manifest.ts:432` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContractRow.lifecycle` | `client/src/lib/appearance-carrier-manifest.ts:433` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContractRow.portal` | `client/src/lib/appearance-carrier-manifest.ts:434` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContractRow.dependsOn` | `client/src/lib/appearance-carrier-manifest.ts:436` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContractRow.incompatibleWith` | `client/src/lib/appearance-carrier-manifest.ts:437` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContract.declared` | `client/src/lib/appearance-carrier-manifest.ts:442` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContract.executable` | `client/src/lib/appearance-carrier-manifest.ts:443` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContract.dependencies` | `client/src/lib/appearance-carrier-manifest.ts:444` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContract.themeObservables` | `client/src/lib/appearance-carrier-manifest.ts:446` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMatrixContract.historicalRows` | `client/src/lib/appearance-carrier-manifest.ts:447` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalSubject.id` | `client/src/lib/appearance-invariant-manifest.ts:21` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalSubject.selector` | `client/src/lib/appearance-invariant-manifest.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalSubject.population` | `client/src/lib/appearance-invariant-manifest.ts:23` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalSubject.sample` | `client/src/lib/appearance-invariant-manifest.ts:24` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalCascade.selector` | `client/src/lib/appearance-invariant-manifest.ts:28` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalCascade.property` | `client/src/lib/appearance-invariant-manifest.ts:29` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalCascade.sources` | `client/src/lib/appearance-invariant-manifest.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalCascade.overloadedSources` | `client/src/lib/appearance-invariant-manifest.ts:31` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalRow.id` | `client/src/lib/appearance-invariant-manifest.ts:49` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalRow.surface` | `client/src/lib/appearance-invariant-manifest.ts:50` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalRow.subjects` | `client/src/lib/appearance-invariant-manifest.ts:51` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalRow.cascade` | `client/src/lib/appearance-invariant-manifest.ts:52` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalRow.merge` | `client/src/lib/appearance-invariant-manifest.ts:53` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalRow.requiredChecks` | `client/src/lib/appearance-invariant-manifest.ts:54` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceHistoricalRow.optionalSubjectIds` | `client/src/lib/appearance-invariant-manifest.ts:55` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.avatarAspect` | `client/src/lib/appearance-message-registry.ts:10` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.avatarRing` | `client/src/lib/appearance-message-registry.ts:11` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.avatarShape` | `client/src/lib/appearance-message-registry.ts:12` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.avatarSize` | `client/src/lib/appearance-message-registry.ts:13` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.autoFixMarkdown` | `client/src/lib/appearance-message-registry.ts:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.chatStyle` | `client/src/lib/appearance-message-registry.ts:15` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.colorQuotedSpeech` | `client/src/lib/appearance-message-registry.ts:16` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.messageActions` | `client/src/lib/appearance-message-registry.ts:17` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.metadataVisibility` | `client/src/lib/appearance-message-registry.ts:18` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.metadataVisibility.showGenerationCost` | `client/src/lib/appearance-message-registry.ts:19` | unreferenced | delete | delete the field |
| `AppearanceMessageCarrierSnapshot.metadataVisibility.showGenerationTimer` | `client/src/lib/appearance-message-registry.ts:20` | unreferenced | delete | delete the field |
| `AppearanceMessageCarrierSnapshot.metadataVisibility.showMessageId` | `client/src/lib/appearance-message-registry.ts:21` | unreferenced | delete | delete the field |
| `AppearanceMessageCarrierSnapshot.metadataVisibility.showModelIcon` | `client/src/lib/appearance-message-registry.ts:22` | unreferenced | delete | delete the field |
| `AppearanceMessageCarrierSnapshot.metadataVisibility.showTimestamps` | `client/src/lib/appearance-message-registry.ts:23` | unreferenced | delete | delete the field |
| `AppearanceMessageCarrierSnapshot.metadataVisibility.showTokenCount` | `client/src/lib/appearance-message-registry.ts:24` | unreferenced | delete | delete the field |
| `AppearanceMessageCarrierSnapshot.showInChatAvatars` | `client/src/lib/appearance-message-registry.ts:26` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AppearanceMessageCarrierSnapshot.showLLMReasoningIcon` | `client/src/lib/appearance-message-registry.ts:27` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportRoute.origin` | `client/src/lib/bug-report-bundle.ts:45` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportRoute.pathname` | `client/src/lib/bug-report-bundle.ts:47` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportRoute.section` | `client/src/lib/bug-report-bundle.ts:49` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportRoute.shell` | `client/src/lib/bug-report-bundle.ts:51` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.userAgent` | `client/src/lib/bug-report-bundle.ts:103` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.viewport` | `client/src/lib/bug-report-bundle.ts:104` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.viewport.width` | `client/src/lib/bug-report-bundle.ts:104` | never-read | delete | delete the field and its writes (`client/src/features/app-shell/lib/bug-report-capture.ts:121`) |
| `BugReportEnvironment.viewport.height` | `client/src/lib/bug-report-bundle.ts:104` | never-read | delete | delete the field and its writes (`client/src/features/app-shell/lib/bug-report-capture.ts:121`) |
| `BugReportEnvironment.devicePixelRatio` | `client/src/lib/bug-report-bundle.ts:105` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.maxTouchPoints` | `client/src/lib/bug-report-bundle.ts:110` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.pointerCoarse` | `client/src/lib/bug-report-bundle.ts:113` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.prefersReducedMotion` | `client/src/lib/bug-report-bundle.ts:114` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.appearance` | `client/src/lib/bug-report-bundle.ts:118` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportEnvironment.appearanceAbsent` | `client/src/lib/bug-report-bundle.ts:121` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportClientBundle.route` | `client/src/lib/bug-report-bundle.ts:128` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportClientBundle.environment` | `client/src/lib/bug-report-bundle.ts:129` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportClientBundle.sources` | `client/src/lib/bug-report-bundle.ts:131` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportClientBundle.evidence` | `client/src/lib/bug-report-bundle.ts:132` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BugReportClientBundle.checkpointTotals` | `client/src/lib/bug-report-bundle.ts:134` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PublicBugReportBundle.format` | `client/src/lib/bug-report-public.ts:80` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PublicBugReportBundle.formatVersion` | `client/src/lib/bug-report-public.ts:81` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PublicBugReportBundle.window` | `client/src/lib/bug-report-public.ts:85` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PublicBugReportBundle.browserErrors.held` | `client/src/lib/bug-report-public.ts:90` | never-read | delete | delete the field and its writes (`client/src/lib/bug-report-public.ts:247`) |
| `PublicBugReportBundle.browserErrors.dropped` | `client/src/lib/bug-report-public.ts:90` | never-read | delete | delete the field and its writes (`client/src/lib/bug-report-public.ts:247`) |
| `BusEventRecord.type` | `client/src/lib/bus-devlog.ts:37` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BusEventRecord.chatId` | `client/src/lib/bus-devlog.ts:39` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `BusEventRecord.keys` | `client/src/lib/bus-devlog.ts:40` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ParsedConfigQuery.unknown` | `client/src/lib/config-search-tokens.ts:41` | never-read | delete | delete the field and its writes (`client/src/lib/config-search-tokens.ts:104`) |
| `ConsoleErrorRecord.source` | `client/src/lib/console-error-ring.ts:34` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ConsoleErrorRecord.text` | `client/src/lib/console-error-ring.ts:38` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ConsoleErrorRecord.stack` | `client/src/lib/console-error-ring.ts:40` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ConsoleErrorRecord.route` | `client/src/lib/console-error-ring.ts:42` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatSettingsHostControlsContribution.anchor` | `client/src/lib/contribution-contracts.ts:91` | never-read | delete | delete the field and its writes (`client/src/features/automation/lib/rules-settings-section.tsx:28`) |
| `CharacterDetailState.characterId` | `client/src/lib/contribution-contracts.ts:209` | never-read | delete | delete the field and its writes (`client/src/features/character/surfaces/character-editor-surface.tsx:251`) |
| `CharacterDetailSectionsContribution.anchor` | `client/src/lib/contribution-contracts.ts:217` | unreferenced | delete | delete the field |
| `MessageToolsRenderer.id` | `client/src/lib/contribution-contracts.ts:261` | unreferenced | delete | delete the field |
| `CorpusModeContribution.listSearch` | `client/src/lib/corpus-modes.ts:28` | never-read | delete | delete the field and its writes (`client/src/features/stats/lib/insights-mode.tsx:22`) |
| `Anchorish.href` | `client/src/lib/download-json.ts:9` | never-read | delete | delete the field and its writes (`client/src/lib/download-json.ts:32`) |
| `Anchorish.download` | `client/src/lib/download-json.ts:10` | never-read | delete | delete the field and its writes (`client/src/lib/download-json.ts:34`) |
| `FlipAnimation.animationName` | `client/src/lib/flip-phase.ts:7` | never-written | delete | delete the field and the branch that reads its default at `client/src/lib/flip-phase.ts:42` |
| `ListPaneHeaderView.accent` | `client/src/lib/list-pane-header-view.ts:18` | never-written | delete | delete the field and the branch that reads its default at `client/src/components/list-pane-header.tsx:30` |
| `ListPaneHeaderView.back` | `client/src/lib/list-pane-header-view.ts:20` | never-written | delete | delete the field and the branch that reads its default at `client/src/components/list-pane-header.tsx:30` |
| `AnimationLifecycleState.observedAt` | `client/src/lib/motion-animation-record.ts:21` | never-read | delete | delete the field and its writes (`client/src/lib/motion-animation-record.ts:140`) |
| `AnimationAttribution.owner` | `client/src/lib/motion-animation-record.ts:25` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationAttribution.mechanism` | `client/src/lib/motion-animation-record.ts:26` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationAttribution.phase` | `client/src/lib/motion-animation-record.ts:27` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationRecord.id` | `client/src/lib/motion-animation-record.ts:31` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationRecord.target` | `client/src/lib/motion-animation-record.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationRecord.properties` | `client/src/lib/motion-animation-record.ts:35` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationRecord.compositorClean` | `client/src/lib/motion-animation-record.ts:37` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationRecord.targetState` | `client/src/lib/motion-animation-record.ts:39` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationRecord.targetState.startingStyle` | `client/src/lib/motion-animation-record.ts:40` | never-read | delete | delete the field and its writes (`client/src/lib/motion-animation-record.ts:89`) |
| `AnimationRecord.targetState.endingStyle` | `client/src/lib/motion-animation-record.ts:41` | never-read | delete | delete the field and its writes (`client/src/lib/motion-animation-record.ts:90`) |
| `AnimationRecord.lifecycleState` | `client/src/lib/motion-animation-record.ts:44` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AnimationRecord.attribution` | `client/src/lib/motion-animation-record.ts:46` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MotionFlaggerDrainReceipt.requestedGeneration` | `client/src/lib/motion-dead-class-flagger.ts:17` | never-read | delete | delete the field and its writes (`client/src/lib/motion-dead-class-flagger.ts:226`) |
| `MotionFlaggerDrainReceipt.completedGeneration` | `client/src/lib/motion-dead-class-flagger.ts:18` | never-read | delete | delete the field and its writes (`client/src/lib/motion-dead-class-flagger.ts:226`) |
| `MotionFlagRecord.at` | `client/src/lib/motion-flaggers.ts:71` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MotionFlagRecord.offender` | `client/src/lib/motion-flaggers.ts:73` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MotionFlagRecord.detail` | `client/src/lib/motion-flaggers.ts:75` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MotionFlagRecord.overBudget` | `client/src/lib/motion-flaggers.ts:77` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MotionFlagRecord.animation` | `client/src/lib/motion-flaggers.ts:95` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

162 rows: 2 deleted, 0 derived, 77 kept, 0 handed off, 83 under owner questions (Q1 76, Q2 2, Q3 5).

Most rows are the shapes of the dev bridge (`window.__orb.*`), the appearance matrix and the bug-report bundle. Their readers are in tooling, which holds restated twin types or zod schemas and reads the page by property name, or the value is serialized whole. A row is kept only where a reader is named below; a row with no coded reader is an owner question, and nothing was deleted for it.

Deleted:

| Row | Result |
| - | - |
| `ParsedConfigQuery.unknown` | deleted with `MutableParse.unknown` and its `push`; no reader in production, tests or tooling. An unknown `@` word is still dropped from the search terms |
| `CorpusModeContribution.listSearch` | deleted with its two writes (`insights-mode.tsx`, `labels-mode.tsx`) and the unused `ListSearchPolicy` import in `corpus-modes.ts`. The section-level `SectionWithList.listSearch` stays: a type test reads it (item 1555) |

Kept, with the reader:

| Rows | Reader |
| - | - |
| `AppearanceMessageRegistryReceipt.mounted`, `.registered`, `.matched`, `.missingIds`, `.staleIds` | `tooling/src/floor/appearance/appearance-matrix.ts:100-106` (schema) and `:247-250` |
| `AppearanceMatrixBridgeContract.rows`, `.messageRegistry` | `appearance-matrix.ts:182-197`, `:256-259`; `tooling/src/snap/ops/appearance-invariant-runtime.ts:72`, `:76` |
| `ShellSnapshot.section`, `.panels`, `.chatOpen` | `tooling/src/snap/lib/map-report.ts:84`, `:123`; `tooling/src/ui-audit/lib/result-rows.ts:28` |
| `OrbNavCapabilities.sections`, `.modalSlots`, `.configGroups`, `.contextTabs`, `.contextTabNames`, `.contextTabsPublished`, `.chatPositions` | `tooling/src/snap/ops/page-validate.ts:196-218`; `tooling/src/snap/contract/map.ts:63-64`; `map-report.ts:32`, `:35`, `:90` |
| `ThemeCarrierObservable.lifecycle` | `appearance-matrix.ts:80`, `:147` (`themeObservables` schema) |
| `AppearanceMatrixContractRow.key`, `.dependsOn`, `.incompatibleWith` | `appearance-matrix.ts:100-105` |
| `AppearanceMatrixContract.declared`, `.executable`, `.dependencies`, `.themeObservables`, `.historicalRows` | `appearance-matrix.ts:189-197`, `:144-148` |
| `AppearanceHistoricalSubject.*`, `.Cascade.*`, `.Row.*` (15 rows) | `appearance-matrix.ts:67-72`, `:110-140` (schema), merge branch at `tooling/src/snap/ops/matrix.ts:381` |
| `AppearanceMessageCarrierSnapshot.*` (17 rows, including `metadataVisibility.*`) | read by dotted path: `agent-bridge-appearance.ts:49` (`nestedValue(entry.snapshot, observable.signal)`) with the signal names at `appearance-carrier-manifest.ts:376-391` |
| `BugReportRoute.pathname`, `BugReportClientBundle.route` | `tooling/src/bug-reports/lib/read.ts:45` |
| `ConsoleErrorRecord.source`, `.text`, `.stack`, `.route` | the whole record is serialized: `tooling/src/floor/browser/browser-diagnostics.ts:249` |
| `MessageToolsRenderer.id` | `ContributorRegistry<Def extends { readonly id: string }>`: `registry.ts:48-51`; `MessageToolsRendererRegistry` is that type (`message-tools-renderer-registry-context.ts:11`) |
| `Anchorish.href`, `.download` | written to the anchor at `download-json.ts:32-34`; the browser reads them on `click()` |
| `FlipAnimation.animationName` | `flip-phase.ts:42`; the browser's `CSSAnimation` writes it |
| `AnimationRecord.target`, `.properties`, `.compositorClean` | `tooling/src/motion-audit/lib/animations.ts:64`, `:71`; `motion-audit/ops/page-validate.ts:85-87` |
| `MotionFlaggerDrainReceipt.requestedGeneration`, `.completedGeneration` | `tooling/src/snap/contract/dead-css.ts:17`; `tooling/src/snap/ops/report-summary-blocks.ts:81` |
| `MotionFlagRecord.at`, `.offender`, `.overBudget`, `.animation` | `tooling/src/motion-audit/ops/page-validate.ts:76-87` |

Owner question Q1 (default: keep, 76 rows, nothing changed). The `window.__orb.*()` and bug-report payload fields that no code reads. Agents read them through an eval, or a person reads the report. Keep them as agent-facing payload, or delete as unread data?

- `OrbRingMetadata.name`, `.read`, `.resettable`, `.description` (the documented reader is the `--eval` in `tooling/src/snap/contract/help.ts:195`)
- `QuerySummary.key`, `.status`, `.fetch`, `.stale` (tooling reads only `.length`, `tooling/src/snap/ops/drive.ts:38`)
- `OrbNavCapabilities.corpusModes`
- `OrbRpgSnapshot.chatId`, `.game`, `.tracker`, `.journal`, `.turnToolCalls`
- `OrbPluginLogLine.*` (3), `OrbPluginPublication.*` (5), `OrbPluginUiHost.*` (5), `OrbPluginUiSurface.*` (2), `OrbPluginUiCommand.*` (2), `OrbPluginUiEntry.*` (2), `OrbPluginUiSnapshot.*` (2). No plugin guest reaches the bridge
- `AppearanceMatrixContractRow.owner`, `.carriers`, `.consumer`, `.lifecycle`, `.portal`
- `BugReportRoute.origin`, `.section`, `.shell`; `BugReportEnvironment.*` (10 rows, including `viewport.width` and `.height`); `BugReportClientBundle.environment`, `.sources`, `.evidence`, `.checkpointTotals`; `PublicBugReportBundle.format`, `.formatVersion`, `.window`, `.browserErrors.held`, `.browserErrors.dropped`
- `BusEventRecord.type`, `.chatId`, `.keys`
- `AnimationLifecycleState.observedAt`; `AnimationAttribution.owner`, `.mechanism`, `.phase`; `AnimationRecord.id`, `.targetState`, `.targetState.startingStyle`, `.targetState.endingStyle`, `.lifecycleState`, `.attribution`
- `MotionFlagRecord.detail`

Owner question Q2 (default: keep, 2 rows). `AppearanceConsumerBinding.file` and `.symbol` are citation data in a typed manifest, like the registry rationale fields in item 1555. Keep the typed pointers, or turn them into comments?

Owner question Q3 (default: keep, 5 rows). `ChatSettingsHostControlsContribution.anchor` and `CharacterDetailSectionsContribution.anchor` are the single-branch discriminant the contract documents; `CharacterDetailState.characterId` is a projection with no contributor (the contract says an unread projection field is a promise). `ListPaneHeaderView.accent` and `.back` have no producer, but `data-scoped` and `list-pane-back` are selectors in `mobile.css:187-205`, and `list-pane-back` is a slot in the owner CSS surface (`packages/client/owner-css-surface.ts:362`). Deleting them changes that surface; the owner decides.

Survey: `codegraph_explore` on the bound and bridge type names and on `bound-fields`; ast-grep (`-l ts` and `-l tsx`) on `useBoundField` and the registry builders; `rg` for each leaf name over `tooling`, `scripts`, `tests/support` and `packages/client/src`, then a read of the declaring and reading files. Typecheck: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0 after the two deletes. CT: `config-search-input` and `library-accessibility`, 8 passed. Lint: `pnpm lint:eslint` on the four touched files, exit 0.
