# FLOW: packages/server/src/routes/game.routes.ts
45 route handlers


## POST "/create"  (L3715-3837, 123 lines)
_flags: DBWRITE:1_
             createGameSchema.parse
             sanitizeGameHudWidgets
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [READ]     connStorage.getById
             parseStoredGenerationParameters
             randomUUID
  [READ]     chats.getById
  [DBWRITE]  chats.update
  [READ]     chats.getById
             chats.create
  [READ]     parseMeta
  [MUTATE]   mergeStoredGenerationParameters
             chats.updateMetadata
  [READ]     chats.getById

## POST "/setup"  (L3840-4186, 347 lines)
_flags: LLM:3 PARSE:4_
             setupSchema.parse
             logDebugOverride
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [STORE]    createCharactersStorage
  [READ]     chats.getById
  [READ]     parseMeta
             now
             eq
             sanitizeGameHudWidgets
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             resolveStoredGameGenerationParameters
  [READ]     characters.getById
             parts.push
             parts.join
             characters.getPersona
             parts.push
             parts.join
  [READ]     characters.getById
             name.trim
             partyNames.push
             name.trim
             parts.push
             partyCards.push
             parts.join
             buildPromptMacroContext
             resolveMacrosWithVariableSnapshot
             processLorebooks
             depthEntries.map
             part.trim
             buildSetupPrompt
             debugLog
             clampGameMaxOutputTokens
             createResponseAbortTracker
             setupAbort.touch
             gameGenOptions
             debugLog
  [LLM]      runGameChatComplete
             extractLeadingThinkingBlocks
             debugLog
  [PARSE]    parseJSON
  [PARSE]    validateGameSetupPayload
             isLikelyTruncatedJsonResponse
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
  [MUTATE]   applyGameSetupPayload
             sendGameSetupApplyError

## POST "/setup/apply-json"  (L4189-4249, 61 lines)
_flags: PARSE:6_
             jsonRepairApplySchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
  [PARSE]    parseJSON
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
  [PARSE]    validateGameSetupPayload
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
  [MUTATE]   applyGameSetupPayload
  [READ]     loadSetupRpgContext
             sendGameSetupApplyError

## POST "/start"  (L4255-4318, 64 lines)
             gameStartSchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             chats.listMessages
             existingMessages.some
             content.trim
             chats.patchMetadata
  [READ]     chats.getById
  [READ]     parseMeta

## POST "/session/start"  (L4337-4608, 272 lines)
_flags: LLM:3 DBWRITE:4_
             startSessionSchema.parse
  [READ]     pendingSessionStarts.get
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
             chats.listByGroup
  [READ]     parseMeta
             name.replace
             parseChatCharacterIds
  [MUTATE]   reconcileGamePartyCharacterIds
             syncSetupConfigPartyIds
             carriedPartyIds.filter
             isPartyNpcId
  [MUTATE]   normalizeStoredSessionSummaries
             chats.updateMetadata
  [DBWRITE]  chats.update
             parseChatCharacterIds
  [DBWRITE]  chats.update
  [READ]     chats.getById
             chats.listMessages
             content.trim
             chats.create
  [STORE]    createGameStateStorage
  [READ]     stateStore.getLatest
  [READ]     parseJsonField
  [MUTATE]   mergeGameInventoryItems
  [MUTATE]   normalizeGameInventoryItems
             inventoryFromPlayerStats
  [READ]     parseMeta
             chats.updateMetadata
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             buildRecapPrompt
  [LLM]      runGameChatComplete
             gameGenOptions
             createResponseAbortSignal
             extractLeadingThinkingBlocks
             chats.createMessage
             chats.updateMessageExtra
             mirrorGameMessageToDiscord
             stateStore.create
             createCheckpointService
             cpSvc.create
  [READ]     chats.getById
  [DBWRITE]  pendingSessionStarts.set
  [READ]     pendingSessionStarts.get
  [DBWRITE]  pendingSessionStarts.delete

## POST "/session/conclude"  (L4611-4878, 268 lines)
_flags: LLM:3 DBWRITE:2 PARSE:4_
             concludeSessionSchema.parse
  [READ]     pendingSessionConclusions.get
             isJsonRepairRouteResult
  [PARSE]    sendJsonRepairRouteResult
             nextSessionRequest.trim
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             getAlreadyConcludedSummary
             parseChatCharacterIds
  [MUTATE]   reconcileGamePartyCharacterIds
             syncSetupConfigPartyIds
  [MUTATE]   normalizeStoredSessionSummaries
             chats.listMessages
  [MUTATE]   applyGameSegmentEditsForPrompt
             formatGameTranscript
             buildStructuredRecap
             createJournal
  [STORE]    createGameStateStorage
  [READ]     gameStates.getLatest
  [MUTATE]   normalizePartyArcPayload
  [MUTATE]   normalizeMoraleValue
  [LLM]      resolveConnection
             resolveStoredGameGenerationParameters
             resolveGameModelAccessPolicy
  [LLM]      createLLMProvider
             createResponseAbortTracker
             gameGenOptions
             conclusionAbort.touch
             fitSessionConclusionMessages
  [LLM]      runGameChatComplete
             extractLeadingThinkingBlocks
  [PARSE]    parseJSON
  [MUTATE]   applySessionConclusionPayload
  [PARSE]    buildJsonRepairPayload
             chats.patchMetadata
  [MUTATE]   normalizeStoredSessionSummaries
             findSessionSummaryForNumber
             buildMoraleMetadataUpdates
             chats.createMessage
             chats.updateMessageExtra
             mirrorGameMessageToDiscord
             chats.createInfluence
             keyDiscoveries.join
             createCheckpointService
             cpSvc.create
             queueGameLorebookKeeperAfterConclusion
  [DBWRITE]  pendingSessionConclusions.set
             isJsonRepairRouteResult
  [PARSE]    sendJsonRepairRouteResult
  [READ]     pendingSessionConclusions.get
  [DBWRITE]  pendingSessionConclusions.delete

## POST "/session/conclude/apply-json"  (L4881-5044, 164 lines)
_flags: DBWRITE:2 PARSE:4_
             jsonRepairApplySchema.parse
  [READ]     pendingSessionConclusions.get
             isJsonRepairRouteResult
  [PARSE]    sendJsonRepairRouteResult
             nextSessionRequest.trim
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             getAlreadyConcludedSummary
             parseChatCharacterIds
  [MUTATE]   reconcileGamePartyCharacterIds
             syncSetupConfigPartyIds
  [MUTATE]   normalizeStoredSessionSummaries
  [MUTATE]   normalizePartyArcPayload
  [MUTATE]   normalizeMoraleValue
  [PARSE]    parseJSON
  [MUTATE]   applySessionConclusionPayload
  [PARSE]    buildJsonRepairPayload
             chats.patchMetadata
  [MUTATE]   normalizeStoredSessionSummaries
             findSessionSummaryForNumber
             buildMoraleMetadataUpdates
             chats.createMessage
             mirrorGameMessageToDiscord
             chats.createInfluence
             keyDiscoveries.join
  [STORE]    createGameStateStorage
             createCheckpointService
             cpSvc.create
             queueGameLorebookKeeperAfterConclusion
  [DBWRITE]  pendingSessionConclusions.set
             isJsonRepairRouteResult
  [PARSE]    sendJsonRepairRouteResult
  [READ]     pendingSessionConclusions.get
  [DBWRITE]  pendingSessionConclusions.delete

## POST "/session/regenerate-lorebook"  (L5047-5112, 66 lines)
_flags: PARSE:2_
             regenerateSessionLorebookSchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
  [MUTATE]   normalizeStoredSessionSummaries
             createResponseAbortTracker
             runGameLorebookKeeperAfterConclusion
             lorebookKeeperAbort.touch
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload

## POST "/session/lorebook-keeper/apply-json"  (L5115-5181, 67 lines)
_flags: PARSE:3_
             jsonRepairApplySchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
  [PARSE]    parseJSON
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
             hasGameLorebookKeeperEntryEnvelope
  [MUTATE]   normalizeGameLorebookKeeperEntries
  [STORE]    createLorebooksStorage
             resolveGameLorebookKeeperBook
             createGameLorebookKeeperEntries
             chats.patchMetadata
             activeLorebookIds.filter

## POST "/session/regenerate-conclusion"  (L5184-5349, 166 lines)
_flags: LLM:3 PARSE:3_
             regenerateSessionConclusionSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [READ]     chats.getById
  [READ]     parseMeta
  [MUTATE]   normalizeStoredSessionSummaries
             chats.listMessages
  [MUTATE]   applyGameSegmentEditsForPrompt
             isSessionConclusionMessage
             formatGameTranscript
             buildStructuredRecap
             createJournal
  [STORE]    createGameStateStorage
  [READ]     gameStates.getLatest
  [MUTATE]   normalizePartyArcPayload
  [MUTATE]   normalizeMoraleValue
  [LLM]      resolveConnection
             resolveStoredGameGenerationParameters
             resolveGameModelAccessPolicy
  [LLM]      createLLMProvider
             createResponseAbortTracker
             gameGenOptions
             conclusionAbort.touch
             fitSessionConclusionMessages
  [LLM]      runGameChatComplete
             extractLeadingThinkingBlocks
  [PARSE]    parseJSON
  [MUTATE]   applySessionConclusionPayload
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
             prevSummaries.map
             chats.updateMetadata
             buildMoraleMetadataUpdates
             content.trim
             chats.updateMessageContent
             chats.updateMessageExtra

## POST "/session/regenerate-conclusion/apply-json"  (L5352-5424, 73 lines)
_flags: PARSE:3_
             jsonRepairApplySchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
  [MUTATE]   normalizeStoredSessionSummaries
  [MUTATE]   normalizePartyArcPayload
  [MUTATE]   normalizeMoraleValue
  [PARSE]    parseJSON
  [MUTATE]   applySessionConclusionPayload
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
             prevSummaries.map
             chats.updateMetadata
             buildMoraleMetadataUpdates
             chats.listMessages
             content.trim
             chats.updateMessageContent

## POST "/session/update-campaign-progression"  (L5427-5632, 206 lines)
_flags: LLM:3 PARSE:3_
             updateCampaignProgressionSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             chats.listByGroup
  [READ]     parseMeta
             gameSessions.find
  [READ]     parseMeta
             chats.listMessages
  [MUTATE]   applyGameSegmentEditsForPrompt
             isSessionConclusionMessage
             formatGameTranscript
             transcriptText.trim
  [STORE]    createGameStateStorage
  [READ]     gameStates.getLatest
             buildStructuredRecap
             createJournal
  [MUTATE]   normalizePartyArcPayload
  [LLM]      resolveConnection
             resolveStoredGameGenerationParameters
  [LLM]      createLLMProvider
             createResponseAbortTracker
             gameGenOptions
             progressionAbort.touch
             resolveGameModelAccessPolicy
             userLines.push
             buildCampaignProgressionPrompt
             userLines.join
             fitMessagesToModelAccessContext
  [LLM]      runGameChatComplete
             extractLeadingThinkingBlocks
  [PARSE]    parseJSON
  [MUTATE]   applyCampaignProgressionPayload
             content.slice
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
             chats.updateMetadata
  [READ]     chats.getById

## POST "/session/update-campaign-progression/apply-json"  (L5635-5712, 78 lines)
_flags: PARSE:3_
             jsonRepairApplySchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             chats.listByGroup
  [READ]     parseMeta
             gameSessions.find
  [READ]     parseMeta
  [MUTATE]   normalizePartyArcPayload
  [PARSE]    parseJSON
  [MUTATE]   applyCampaignProgressionPayload
  [PARSE]    sendJsonRepairError
  [PARSE]    buildJsonRepairPayload
             chats.updateMetadata
  [READ]     chats.getById

## POST "/party/recruit"  (L5716-5963, 248 lines)
_flags: LLM:3 PARSE:1_
             recruitPartyMemberSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createCharactersStorage
  [STORE]    createConnectionsStorage
  [STORE]    createGameStateStorage
  [READ]     chats.getById
  [READ]     parseMeta
             characterName.trim
  [MUTATE]   normalizeCharacterLookupName
             chars.list
             allCharacters.flatMap
             name.trim
  [MUTATE]   normalizeCharacterLookupName
             parsedCharacters.filter
             lookup.includes
             requestedLookup.includes
             findGameNpcByName
             parsedCharacters.map
             getStoredPartyCharacterIds
             buildPartyNpcId
             findExistingGameCharacterCardIndex
             currentPartyIds.includes
             buildFallbackGameCharacterCard
             buildNpcPartyCard
             extractRecruitCharacterRpgStats
             buildRecruitCharacterSourceCard
             buildNpcRecruitCharacterSourceCard
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             resolveStoredGameGenerationParameters
  [READ]     stateStore.getLatest
  [MUTATE]   applyGameSegmentEditsForPrompt
             chats.listMessages
             stripGmCommandTags
  [READ]     characterById.get
             isPartyNpcId
             gameNpcs.find
             buildPartyNpcId
             currentCards.find
             name.trim
             buildPartyNpcId
             name.trim
             buildPartyRecruitCardPrompt
             createResponseAbortSignal
  [LLM]      runGameChatComplete
             gameGenOptions
             extractLeadingThinkingBlocks
  [PARSE]    parseJSON
  [MUTATE]   normalizeGeneratedGameCharacterCard
             chats.patchMetadataWithCharacterIds
  [MUTATE]   mergeRecruitIntoGameMetadata

## POST "/party/remove"  (L5967-6068, 102 lines)
             removePartyMemberSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createCharactersStorage
  [READ]     chats.getById
  [READ]     parseMeta
             getStoredPartyCharacterIds
             chars.list
             allCharacters.flatMap
             name.trim
  [MUTATE]   normalizeCharacterLookupName
             characterName.trim
  [MUTATE]   normalizeCharacterLookupName
             currentPartyIds.flatMap
  [READ]     charactersById.get
             isPartyNpcId
             gameNpcs.find
             buildPartyNpcId
             currentCards.find
             name.trim
             buildPartyNpcId
             name.trim
             currentParty.push
  [MUTATE]   normalizeCharacterLookupName
             currentParty.filter
             lookup.includes
             requestedLookup.includes
             chats.patchMetadataWithCharacterIds
             removeMemberFromGameMetadata

## POST "/dice/roll"  (L6071-6075, 5 lines)
             diceRollSchema.parse
             rollDice

## POST "/skill-check"  (L6089-6149, 61 lines)
             skillCheckSchema.parse
  [STORE]    createGameStateStorage
  [READ]     stateStore.getLatest
             skill.toLowerCase
             getGoverningAttribute
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             mapSheetAttributesToRPG
             attributeModifier
             resolveSkillCheck
  [STORE]    createChatsStorage
             chats.getMessage
             replaceFirstUnresolvedSkillCheckTag
             chats.updateMessageContent

## POST "/morale"  (L6158-6171, 14 lines)
             moraleSchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             applyMoraleEvent
             chats.patchMetadata
             buildMoraleMetadataUpdates

## POST "/state/transition"  (L6174-6223, 50 lines)
             stateTransitionSchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             validateTransition
             chats.patchMetadata
             chats.createInfluence
  [STORE]    createGameStateStorage
  [READ]     stateStore.getLatest
             createCheckpointService
             cpSvc.create

## POST "/map/generate"  (L6226-6293, 68 lines)
_flags: LLM:3 PARSE:1_
             mapGenerateSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [READ]     chats.getById
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             buildMapGenerationPrompt
             createResponseAbortSignal
  [LLM]      runGameChatComplete
             gameGenOptions
             extractLeadingThinkingBlocks
  [PARSE]    parseJSON
  [READ]     parseMeta
             getGameMapsFromMeta
             ensureGameMapId
  [MUTATE]   withActiveGameMapMeta
  [MUTATE]   buildHydratedGameMeta
             chats.updateMetadata
             getGameMapsFromMeta
             getGameMapId

## POST "/map/move"  (L6296-6356, 61 lines)
             mapMoveSchema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             getGameMapsFromMeta
             getGameMapId
             maps.find
             getGameMapId
             cells.findIndex
             nodes.findIndex
  [MUTATE]   buildHydratedGameMeta
  [MUTATE]   withActiveGameMapMeta
             getGameMapsFromMeta
             hydratedMaps.find
             getGameMapId
  [MUTATE]   withActiveGameMapMeta
             chats.updateMetadata
             getGameMapsFromMeta
             getGameMapId

## GET "/:gameId/sessions"  (L6359-6369, 11 lines)
  [STORE]    createChatsStorage
             chats.listByGroup
  [READ]     parseMeta

## POST "/combat/round"  (L6372-6499, 128 lines)
             z.object
             z.string
             z.array
             z.object
             z.number
             z.enum
             z.object
             z.enum
             z.number
             z.object
             z.number
             z.enum
             z.number
             z.enum
             z.string
             z.enum
             z.number
             z.enum
             z.boolean
             z.object
             z.enum
             z.number
             z.enum
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             resolveCombatRound

## GET "/elements/presets"  (L6502-6509, 8 lines)
             listElementPresets
             names.map
             getElementPreset

## GET "/elements/preset/:name"  (L6512-6528, 17 lines)
             getElementPreset
             reactions.map

## POST "/combat/loot"  (L6531-6545, 15 lines)
             z.object
             z.string
             z.number
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             generateCombatLoot

## POST "/loot/generate"  (L6548-6562, 15 lines)
             z.object
             z.string
             z.number
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             generateLootTable

## POST "/time/advance"  (L6565-6593, 29 lines)
             z.object
             z.string
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             createInitialTime
             isTimeOfDayLabel
             setTimeOfDay
             advanceTime
             chats.updateMetadata
  [STORE]    createGameStateStorage
             updateLatestGameStateWithTrackerLocks
             formatGameTime

## POST "/weather/update"  (L6596-6645, 50 lines)
             z.object
             z.string
             z.enum
             z.string
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             inferBiome
             generateWeather
             chats.updateMetadata
  [STORE]    createGameStateStorage
             updateLatestGameStateWithTrackerLocks
             shouldWeatherChange
             inferBiome
             generateWeather
             chats.updateMetadata
  [STORE]    createGameStateStorage
             updateLatestGameStateWithTrackerLocks

## POST "/encounter/roll"  (L6648-6670, 23 lines)
             z.object
             z.string
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             rollEncounter
             rollEnemyCount

## POST "/reputation/update"  (L6673-6697, 25 lines)
             z.object
             z.string
             z.array
             z.object
             z.string
             z.number
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             processReputationActions
  [MUTATE]   buildHydratedGameMeta
             chats.updateMetadata

## POST "/journal/entry"  (L6700-6750, 51 lines)
             z.object
             z.string
             z.enum
             z.record
             z.unknown
             schema.parse
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             createJournal
             addLocationEntry
             addNpcEntry
             addCombatEntry
             upsertQuest
             addInventoryEntry
             addEventEntry
             addNoteEntry
             chats.patchMetadata

## GET "/:chatId/journal"  (L6753-6769, 17 lines)
  [STORE]    createChatsStorage
  [READ]     chats.getById
  [READ]     parseMeta
  [MUTATE]   buildHydratedGameMeta
             createJournal
             chats.updateMetadata
             buildStructuredRecap

## PUT "/:chatId/notes"  (L6772-6781, 10 lines)
             z.object
             z.string
  [STORE]    createChatsStorage
  [READ]     chats.getById
             chats.patchMetadata

## PUT "/:chatId/widgets"  (L6784-6812, 29 lines)
             z.array
             sanitizeGameHudWidgets
  [STORE]    createChatsStorage
  [READ]     chats.getById
             chats.patchMetadata

## POST "/party-turn"  (L6829-7083, 255 lines)
_flags: LLM:3 DBWRITE:1_
             partyTurnSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [STORE]    createCharactersStorage
  [READ]     chats.getById
  [READ]     parseMeta
             getStoredPartyCharacterIds
  [LLM]      resolveConnection
             resolveStoredGameGenerationParameters
             name.trim
  [DBWRITE]  gameCardByName.set
  [MUTATE]   normalizeCharacterLookupName
  [READ]     chars.getById
  [READ]     gameCardByName.get
  [MUTATE]   normalizeCharacterLookupName
             class.trim
             card.push
             abilities.join
             card.push
             strengths.join
             card.push
             weaknesses.join
             card.push
             card.filter
             partyCards.push
             partyIdNamePairs.push
             isPartyNpcId
             gameNpcs.find
             buildPartyNpcId
             notes.join
  [READ]     gameCardByName.get
  [MUTATE]   normalizeCharacterLookupName
             class.trim
             card.push
             abilities.join
             card.push
             strengths.join
             card.push
             weaknesses.join
             card.push
             partyCards.push
             card.filter
             partyIdNamePairs.push
             chars.getPersona
             buildPartySystemPrompt
             listPartySprites
  [LLM]      createLLMProvider
             createResponseAbortSignal
  [LLM]      runGameChatComplete
             gameGenOptions
             extractLeadingThinkingBlocks
             isDebugAgentsEnabled
             logDebugOverride
             debugLog
             repRegex.exec
             repActions.push
             processReputationActions
  [READ]     chats.getById
  [READ]     parseMeta
             chats.updateMetadata
             raw.replace
             chats.createMessage
             chats.updateMessageExtra
             mirrorGameMessageToDiscord

## POST "/spotify/candidates"  (L7119-7158, 40 lines)
             spotifyCandidatesSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createAgentsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             buildGameSpotifySceneQuery
             currentSpotifyTrack.startsWith
  [MUTATE]   normalizeSpotifyTrackHistory
             getGameSpotifyCandidates
             getGameSpotifyErrorStatus

## POST "/spotify/play"  (L7169-7190, 22 lines)
             spotifyPlaySchema.parse
  [STORE]    createChatsStorage
  [STORE]    createAgentsStorage
  [READ]     chats.getById
             playGameSpotifyTrack
  [READ]     parseMeta
             getGameSpotifyErrorStatus

## POST "/scene-wrap"  (L7231-7772, 542 lines)
_flags: LLM:5 IMAGE:5 PARSE:1_
             sceneWrapSchema.parse
             isDebugAgentsEnabled
             logDebugOverride
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [STORE]    createAgentsStorage
  [READ]     chats.getById
  [READ]     parseMeta
  [LLM]      resolveConnection
             resolveStoredGameGenerationParameters
             resolveGameImageConnectionId
  [STORE]    createGameStateStorage
             gameImagePromptInstructions.trim
             chats.listMessages
             allMsgs.filter
             currentGameSessionNumber
             isIllustrationAllowed
             buildSceneAnalyzerSystemPrompt
             buildSceneAnalyzerUserPrompt
             debugLog
  [LLM]      createLLMProvider
             createResponseAbortSignal
             gameGenOptions
  [LLM]      runGameChatComplete
             extractLeadingThinkingBlocks
             raw.trim
  [LLM]      runGameChatStream
             extractLeadingThinkingBlocks
             debugLog
  [PARSE]    parseJSON
             postProcessSceneResult
             getAssetManifest
             allAssetKeys.filter
             k.startsWith
             allAssetKeys.filter
             k.startsWith
             scoreMusic
             scoreAmbient
             connections.getWithKey
  [LLM]      resolveConnectionImageDefaults
  [READ]     loadImageGenerationUserSettings
  [STORE]    createCharactersStorage
             charStore.list
             readPreferredFullBodySpriteBase64
             addNameLookupEntry
             extractCharacterAppearanceText
             addNameLookupEntry
             collectIllustrationCharacterAssets
  [IMAGE]    generateSceneIllustration
  [STORE]    createPromptOverridesStorage
             addGeneratedIllustrationToGallery
             applyGeneratedIllustration
  [READ]     chats.getById
  [READ]     parseMeta
             chats.updateMetadata
             getAssetManifest
             k.startsWith
             k.toLowerCase
             chosenBg.toLowerCase
  [IMAGE]    generatedBackgroundSlug
  [IMAGE]    generateBackground
             chosenBg.replace
  [STORE]    createPromptOverridesStorage
             getAssetManifest
             k.startsWith
             k.toLowerCase
             segBg.toLowerCase
  [IMAGE]    generatedBackgroundSlug
  [IMAGE]    generateBackground
             segBg.replace
  [STORE]    createPromptOverridesStorage
  [STORE]    createGameStateStorage
  [READ]     stateStore.getLatest
             buildSceneAssetNpcCandidates
             findCharAvatarFuzzy
             libResolvedNpcs.push
  [STORE]    createChatsStorage
  [READ]     chatsStore.getById
  [READ]     parseMeta
             upsertGameNpcAvatarEntries
             chatsStore.updateMetadata
             libResolvedNpcs.map
             npcs.filter
  [READ]     chats.getById
  [READ]     parseMeta
             chats.updateMetadata
             debugLog
             raw.slice

## POST "/generate-assets/preview"  (L7834-8103, 270 lines)
_flags: LLM:1 IMAGE:2_
  [IMAGE]    generateAssetsSchema.parse
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [STORE]    createAgentsStorage
  [READ]     chats.getById
  [READ]     parseMeta
             resolveGameImageConnectionId
             connections.getWithKey
  [READ]     loadImageGenerationUserSettings
  [LLM]      resolveConnectionImageDefaults
  [STORE]    createPromptOverridesStorage
             prompt.trim
             gameImagePromptInstructions.trim
  [STORE]    createGameStateStorage
  [IMAGE]    generatedBackgroundSlug
  [READ]     promptOverrideById.get
             gameImagePromptReviewId
             buildBackgroundProviderPrompt
             backgroundTag.replace
             items.push
             gameImagePromptReviewId
             chats.listMessages
             allMsgs.filter
             currentGameSessionNumber
             isIllustrationAllowed
  [STORE]    createCharactersStorage
             charStore.list
             readPreferredFullBodySpriteBase64
             addNameLookupEntry
             extractCharacterAppearanceText
             addNameLookupEntry
             prompt.slice
  [READ]     promptOverrideById.get
             gameImagePromptReviewId
             collectIllustrationCharacterAssets
             buildSceneIllustrationProviderPrompt
             items.push
             gameImagePromptReviewId
  [MUTATE]   normalizeJournalMatch
             addExistingNpcAvatar
  [STORE]    createGameStateStorage
             parseStoredJson
             addExistingNpcAvatar
             buildNpcAvatarUrl
             addExistingNpcAvatar
  [STORE]    createCharactersStorage
             charStore.list
             addNameLookupEntry
  [MUTATE]   normalizeJournalMatch
             forceNpcAvatarNames.has
  [READ]     existingNpcAvatarByName.get
             findCharAvatarFuzzy
             findNpcRecordByName
             findRecordByName
             resolveNpcPortraitAppearance
  [READ]     promptOverrideById.get
             gameImagePromptReviewId
             buildNpcPortraitProviderPrompt
             optionalTrimmedString
             items.push
             gameImagePromptReviewId

## POST "/generate-assets"  (L8105-8530, 426 lines)
_flags: LLM:1 IMAGE:5_
  [IMAGE]    generateAssetsSchema.parse
             createResponseAbortSignal
             acquireGameAssetGenerationLock
             isDebugAgentsEnabled
             logDebugOverride
  [STORE]    createChatsStorage
  [STORE]    createConnectionsStorage
  [STORE]    createAgentsStorage
             debugLog
  [READ]     chats.getById
  [READ]     parseMeta
             resolveGameImageConnectionId
             connections.getWithKey
  [LLM]      resolveConnectionImageDefaults
             gameImagePromptInstructions.trim
  [STORE]    createGameStateStorage
  [READ]     loadImageGenerationUserSettings
             prompt.trim
  [IMAGE]    generatedBackgroundSlug
  [READ]     promptOverrideById.get
             gameImagePromptReviewId
  [IMAGE]    generateBackground
             backgroundTag.replace
  [STORE]    createPromptOverridesStorage
             pickFallbackBackgroundTag
             getAssetManifest
  [READ]     chats.getById
  [READ]     parseMeta
             chats.updateMetadata
             chats.listMessages
             allMsgs.filter
             currentGameSessionNumber
             isIllustrationAllowed
  [STORE]    createCharactersStorage
             charStore.list
             readPreferredFullBodySpriteBase64
             addNameLookupEntry
             extractCharacterAppearanceText
             addNameLookupEntry
             prompt.slice
  [READ]     promptOverrideById.get
             gameImagePromptReviewId
             collectIllustrationCharacterAssets
  [IMAGE]    generateSceneIllustration
  [STORE]    createPromptOverridesStorage
             addGeneratedIllustrationToGallery
  [READ]     chats.getById
  [READ]     parseMeta
             chats.updateMetadata
  [MUTATE]   normalizeJournalMatch
  [READ]     chats.getById
  [READ]     parseMeta
             addExistingNpcAvatar
  [STORE]    createGameStateStorage
             parseStoredJson
             addExistingNpcAvatar
             buildNpcAvatarUrl
             addExistingNpcAvatar
  [STORE]    createCharactersStorage
             charStore.list
             addNameLookupEntry
  [MUTATE]   normalizeJournalMatch
             forceNpcAvatarNames.has
  [READ]     existingNpcAvatarByName.get
             generatedNpcAvatars.push
             findCharAvatarFuzzy
             generatedNpcAvatars.push
             findNpcRecordByName
             findRecordByName
             resolveNpcPortraitAppearance
  [IMAGE]    generateNpcPortrait
             optionalTrimmedString
  [STORE]    createPromptOverridesStorage
  [READ]     promptOverrideById.get
             gameImagePromptReviewId
  [READ]     promptOverrideById.get
             gameImagePromptReviewId
             generatedNpcAvatars.push
             avatarUrl.split
             runPortraitWorker
             generatedNpcAvatars.map
  [MUTATE]   normalizeJournalMatch
             chats.patchMetadata
             upsertGameNpcAvatarEntries
             debugLog
             releaseAssetGeneration

## POST "/checkpoint"  (L8548-8570, 23 lines)
             checkpointCreateSchema.parse
             createCheckpointService
  [STORE]    createGameStateStorage
  [READ]     stateStore.getLatest
             checkpoints.create

## GET "/:chatId/checkpoints"  (L8574-8578, 5 lines)
             createCheckpointService
             checkpoints.listForChat

## DELETE "/checkpoint/:id"  (L8582-8587, 6 lines)
             createCheckpointService
             checkpoints.deleteById

## POST "/checkpoint/load"  (L8598-8658, 61 lines)
             checkpointLoadSchema.parse
             createCheckpointService
  [STORE]    createGameStateStorage
  [STORE]    createChatsStorage
  [READ]     checkpointSvc.getById
  [READ]     stateStore.getById
             chats.createMessage
  [READ]     parseJsonField
             stateStore.create
  [READ]     parseJsonField
             parseTrackerFieldLocks
  [READ]     chats.getById
             chats.patchMetadata