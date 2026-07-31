# Friends, blocks, and invitations

Every profile receives a stable six-character public code. Search is exact by
code or case-insensitive display name and returns only public identity fields.
Display names are intentionally not unique.

Friend requests are directional until accepted; accepted relationships are
stored once using ordered user IDs. The database rejects self-requests,
duplicate pending pairs, blocked pairs, and already-friends pairs. Either user
can remove a friendship. Blocking cancels pending requests and removes the
friendship; blocked pairs cannot search, request, invite, or join a duel
together.

Friends can send a private-duel invitation. Invitations reference a real duel,
expire after 30 minutes, and may be accepted or declined. Accepting validates
the recipient and the duel's current state; the normal transactional duel join
still owns the participant slot.

The friends screen refreshes a bounded state payload every 30 seconds. It does
not subscribe to a global presence feed and includes no chat or direct messages.
