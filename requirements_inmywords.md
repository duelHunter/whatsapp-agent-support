## QR and whatapp session

- When QR is scaned, backend QR generation should be stoped.
- Database should be updated with phone_number and other columns of organizations table
- Whatsapp session should be saved in the backend. Even though user(frontend) has leaved or logged out, the session should had be activated.
- Recent chats should be updated 


## Auto replying Bot + Agent

- replying bot is automatically starts when kb is uploaded and bot is on by the user.
- Chat session is handovered to a human agent, when agent can't handle some situation when communicating with a specific customer. That decision is taken by the agent based on a given sets of instructions.


## Message storing

- When a whatsapp account is connected to the backend, all messages should be saved in the database