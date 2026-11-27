# In-app requests

The request inbox derives pending notifications from existing friend requests, duel invitations and recent completed matches. There is no duplicate notification table. The server authenticates the caller and filters blocked/deleted senders, expired invitations, filled lobbies and expired rematches. The UI polls every five seconds on visible non-gameplay pages, refreshes when focused, and displays a short in-app banner once per request per browser session. No push permissions are requested.

Friend and private duel invitations use their existing accept/decline APIs. Rematch acceptance uses the existing mutual-consent RPC and its 60-second window; a ready rematch may be joined from the inbox if the requester has left the results page. Rematch dismissal is local to the tab session, not a server-side decline. The sender waits for expiration. A persistent decline would need an atomic database change; do not clear timestamps outside the existing match lock.

No production schema change is needed. Browser tests mock the API; live two-player testing is still required. Direct invitations use the existing Friends invite action, which creates a private lobby.
