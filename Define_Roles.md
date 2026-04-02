### Admin Role
 - Admin has all the controll
 - Only the admin can create accounts
 - Admin can add new users
 - That can be only one admin for a number
 - Only admin can scan QR and connect whatsapp account + remove account
 - Only admin can access to KB and analytics
 - toggling the auto-reply bot on/off



### User Role
 - User have access to reply messages
 - The AI agent decides to handover the conversation to user


Authenticate user and admin for backend requests accoring to above privileges
QR should disappear after the successful connection.



Missing Logic: We need to enforce a validation check. While your database memberships table has a role column, there is currently nothing preventing you from promoting multiple people to "admin".
How to solve: We need to add a PostgreSQL trigger or a software-level check on the backend memberships update/insert endpoint that guarantees COUNT(role) WHERE role = 'admin' AND org_id = X never exceeds 1.