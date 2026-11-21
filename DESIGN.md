# KKB BULSU members portal: UI foundations

Source: the "UI foundations" Figma export (desktop + mobile). Supersedes the earlier Pinterest-style restyle.
`apply_restyle.py` belongs to that earlier restyle. Do not run it; it would overwrite this system.

## Tokens (src/index.css)
| token | value | use |
|---|---|---|
| bg | #F7F5F1 | page background |
| white | #FFFFFF | cards, inputs, sidebar |
| ink | #242220 | text |
| muted | #746F69 | secondary text |
| line | #E5E0D9 | hairlines, card borders |
| accent | #8A1C2E | action and selection (maroon) |
| soft | #F7EAED | selected rows, banners, quiet danger |
| gold | #B79349 | one tiny signal only (nav badge, "starts soon") |

Inter only. Sizes 40 / 28 / 20 / 16 / 14 / 12. 8 px spacing rhythm. 6 px corners (pills only for progress bars and step dots).
No gradients, no shadows. Money is PHP with tabular figures. Payment channel is GCash.

## Shared pieces
- `components/ui.ts`: input, primary / secondary / danger buttons, card, eyebrow, notice classes.
- `components/PageHeader.tsx`: eyebrow, regular-weight title, muted subtitle, optional action.
- `components/Stepper.tsx`: Ordered / Paid / Arrived / Claimed. Only completed steps are maroon.
- `components/Layout.tsx`: 224 px sidebar that collapses to a 64 px rail, breadcrumb bar, "Up next" banner, 320 px mobile drawer. Navigation is role aware (`nav.ts`).
- `components/AuthShell.tsx`: split auth layout with photo, used by Login, Register, Pending.

## Imagery
`public/images/community.jpg` and `outreach.jpg` are sample photos from the design file (used on the sign-in screens). They are placeholders, not university documentation. Merch photos are now uploaded by finance per item.

## Setup
See `SETUP.md` for the full checklist (database updates, the Supabase password-reset redirect, notifications).

## Database
Run these in the Supabase SQL editor, in order:
1. `supabase/013_member_details.sql`: college, program and year/section from the sign-up form.
2. `supabase/014_merch_photos_removals.sql`: merch photos (`merch-images` bucket), removing orders (`delete_order`), declining applicants (`decline_member`).
3. `supabase/015_stock_waitlist_deactivate_notifications.sql`: stock limit and waitlist, deactivating members, in-app notifications.
