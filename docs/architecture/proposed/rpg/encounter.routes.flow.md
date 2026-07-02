# FLOW: packages/server/src/routes/encounter.routes.ts
3 route handlers


## POST "/init"  (L547-642, 96 lines)
_flags: LLM:2 PARSE:1_
             logDebugOverride
  [READ]     chats.getById
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             buildCharacterContext
             buildPersonaContext
             buildGameStateContext
  [READ]     loadSpellbookContext
             chats.listMessages
             chatMessages.slice
             buildInitPrompt
             debugLog
             provider.chatComplete
             debugLog
  [PARSE]    parseJSON
             debugLog
             chats.patchMetadata

## POST "/action"  (L645-736, 92 lines)
_flags: LLM:2 PARSE:1_
  [READ]     chats.getById
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             buildCharacterContext
             buildPersonaContext
  [READ]     loadSpellbookContext
             chats.listMessages
             chatMessages.slice
             buildActionPrompt
             provider.chatComplete
             fallbackActionResult
  [PARSE]    parseJSON
             fallbackActionResult

## POST "/summary"  (L739-804, 66 lines)
_flags: LLM:2_
             validResults.includes
             validResults.join
  [READ]     chats.getById
  [LLM]      resolveConnection
  [LLM]      createLLMProvider
             buildCharacterContext
             buildPersonaContext
             buildSummaryPrompt
             provider.chatComplete
             content.replace
             chats.createMessage
             chats.patchMetadata