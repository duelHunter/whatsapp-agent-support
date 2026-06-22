## QR and whatapp session

<!-- - When QR is scaned, backend QR generation should be stoped.
- Database should be updated with phone_number and other columns of organizations table
- Whatsapp session should be saved in the backend. Even though user(frontend) has leaved or logged out, the session should had be activated. Bot and agent should be always activated.
- Recent chats should be updated in the database. -->


## Auto replying Bot + Agent

- replying bot is automatically starts when kb is uploaded and bot is on by the user.
- Chat session is handovered to a human agent, when agent can't handle some situation when communicating with a specific customer. That decision is taken by the agent based on a given sets of instructions.


## Message storing
<!-- 
- When a whatsapp account is connected to the backend, all messages should be saved in the database -->

## whatsapp status are detected as new messages(bug)
 
Here are the logs 
``` text
✅ Updated account info: No (94779433006)
📩 New message detected: Congratulations ❤️✨
msg.from status@broadcast
📩 New message detected: Congratulations both ❤
msg.from status@broadcast
📩 New message detected: Congratulations Mittama❤️
msg.from status@broadcast
📩 New message detected: 🪷තුන් ලොවක් සනසවනු වස් සිදුහත් කුමරු ලුම්බිණි සල් රුක් සෙවණේ මෙලොව උපත ලද,

🪷මෝහාන්ධකාරයෙන් සියළු සතුන් මුදවාලනු වස් අප මහා බෝධිසත්වයාණන් වහන්සේ ඇසතු බෝ රුක් මුල උතුම් බුදු පදවි ලද,

🪷ලෝ වැසි සියල්ලන් හට දුකින් මිදෙන යතාර්ථය පෙන්වා අප මහා ගෞතම සම්බුදුරජාණන් වහන්සේ උපවත්තන සල් උයනේ පිරිනිවන ලද,

මෝහාන්ධකාරය දුරලා යතාර්ථයේ තතු දකින උතුම් වෙසක් මංගල්‍යයක් වේවා!☸️

ඉංජිනේරු පීඨ ශිෂ්‍ය සංගමය
රුහුණ විශ්වවිද්‍යාලය
msg.from status@broadcast
✅ Client info found via polling workaround.
📱 Updating WhatsApp account 09dd0d4e-b45a-4a71-a617-4373c34260f6 to status: connected
✅ WhatsApp account status updated: connected
📱 QR Scanned successfully. Connected phone number: 94779433006
✅ Updated account info: No (94779433006)
🟢 Dashboard socket connected: H43aY8gnizt6qzchAAAB
🔴 Dashboard socket disconnected: H43aY8gnizt6qzchAAAB
```

## Dashboard and Analytics
<!-- - Total messages today -->
<!-- - AI vs. Human Ratio: A pie chart showing how many messages were handled automatically by Gemini versus how many required human intervention -->
- AI Performance: A chart tracking average AI response times 

## LLM for RAG and agent
- option to add api keys for models


## From raheed
- Real-time web search — uses Tavily API to search the web when knowledge base lacks an answer.
- Multi-turn conversation memory — LangChain MemorySaver keeps context per user thread
- Knowledge base management — upload/delete PDF, DOCX, TXT, CSV documents
- Settings panel — configure AI model, temperature, max tokens, system prompt
- sonner toast notifications
- zod validation



book store database
user can order books