-- ============================================================
-- Step 13: Remove the chat rooms (not used anymore)
-- Run it last. This deletes the chat tables and anything in them.
-- ============================================================
drop table if exists public.chat_messages;
drop table if exists public.chat_rooms;
drop function if exists public.can_access_room(uuid);
