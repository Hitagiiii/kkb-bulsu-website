# KKB BULSU — My Space Personal Hub (v1)

This update adds a member-facing personal hub and an admin overview. It keeps the existing shared officer Tasks page (`/tasks`) unchanged.

## Included
- `/my-space` personal hub overview
- My To-Do List at `/my-space/tasks` (individual task cards with checkboxes)
- My Goals with progress tracking
- My Planner for personal dates/reminders
- My Notes
- My Devotional Journal
- Shortcuts to existing attendance, merch orders, Verse of the Day, and account/profile pages
- Admin view and member filter for all personal hub content
- Supabase Realtime subscriptions for the personal content tables

## Apply source files
Merge the `src/` files into the matching paths in your project. These files are the only frontend files changed by this patch:
- `src/App.tsx`
- `src/nav.ts`
- `src/components/NavIcon.tsx`
- `src/pages/MySpace.tsx`
- `src/pages/MyTasks.tsx`

The `My Space` sidebar item is visible to all approved roles. The existing officer-only `/tasks` page is untouched.

## Apply database migration
Run `supabase/019_personal_hub.sql` once in Supabase SQL Editor, after migrations 017 and 018.

Migration numbering:
- 016 — Merch Orders Realtime (existing; do not replace)
- 017 — Verse of the Day
- 018 — Documents/Minutes access restriction
- 019 — Personal Hub (this migration)

**Important:** This unified migration 019 replaces the earlier standalone `019_personal_todos.sql` draft. Do not run both files or reuse the old draft. This migration creates the to-do table and the goals, planner, notes, and devotional tables together.

## Access model
- Members, officers, and treasurers can create, view, update, and delete their own personal entries.
- Admins can read all members' personal entries across tasks, goals, planner, notes, and devotional journals.
- Admins have view-only access through the provided UI; they cannot edit or delete members' entries.
- Row Level Security enforces owner access and admin read access in Supabase, not just in the frontend.

## Validation
TypeScript project checking (`npx tsc -b --pretty false`) passed on the assembled source tree. The full Vite build could not be completed in this environment because the `vite` executable returned `Permission denied`; run `npm run build` locally before deployment.
