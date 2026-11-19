KKB BULSU restyle package

1. Copy the src/ folder over your project's src/ (it only contains the 6 files that were fully rewritten).
2. From the project root run:  python apply_restyle.py
   This patches the other files (Events, Merch, Announcements, BudgetDetail, etc.).
3. npm run build

The supabase/ migrations are unchanged by the restyle, so nothing needs replacing there.
