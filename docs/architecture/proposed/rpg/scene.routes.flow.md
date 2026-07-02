# FLOW: packages/server/src/routes/scene.routes.ts
5 route handlers


## POST "/create"  (L232-324, 93 lines)
  [READ]     chats.getById
             parseCharacterIds
             chats.create
             buildPersonaContext
             getCharacterName
             getRecentMessages
             stripConversationPromptTimestamps
  [READ]     parseMetadata
             chats.updateMetadata
             chats.connectChats
             chats.createMessage
             firstMsgParts.join

## POST "/conclude"  (L330-484, 155 lines)
_flags: LLM:2 DBWRITE:1_
  [READ]     chats.getById
  [READ]     parseMetadata
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             parseCharacterIds
             buildCharacterContext
             buildPersonaContext
             getRecentMessages
             now.getFullYear
             now.getMonth
             now.getDate
             provider.chatComplete
             getErrorMessage
             chats.createMessage
             getCharacterName
  [READ]     chars.getById
             memories.push
             now.toISOString
  [DBWRITE]  chars.update
             chats.updateMetadata
  [READ]     chats.getById
  [READ]     parseMetadata
             chats.updateMetadata
             chats.disconnectChat

## POST "/abandon"  (L488-515, 28 lines)
  [READ]     chats.getById
  [READ]     parseMetadata
  [READ]     chats.getById
  [READ]     parseMetadata
             chats.updateMetadata
             chats.disconnectChat
             chats.remove

## POST "/fork"  (L521-699, 179 lines)
  [READ]     chats.getById
  [READ]     parseMetadata
             chats.listMessages
             sceneMessages.some
             chats.create
             name.startsWith
             name.replace
             parseCharacterIds
             chats.updateMetadata
  [READ]     parseMetadata
             buildRoleplayForkMetadata
             buildForkContextMessage
             copiedMessages.push
             chats.getSwipes
             swipes.map
             swipes.find
             copiedMessages.push
             chats.createMessagesBatch
  [READ]     chats.getById
  [READ]     parseMetadata
             chats.updateMetadata
             chats.disconnectChat
             chats.remove

## POST "/plan"  (L704-869, 166 lines)
_flags: LLM:2_
  [READ]     chats.getById
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             buildCharacterContext
             buildPersonaContext
             listAvailableBackgrounds
             availableBackgrounds.join
             getRecentMessages
             stripConversationPromptTimestamps
             characterIds.map
             historyText.slice
             provider.chatComplete
             raw.replace
             cleaned.indexOf
             cleaned.lastIndexOf
             cleaned.substring
             jsonStr.replace
             raw.slice
             availableBackgrounds.includes
             raw.startsWith
             characterIds.map