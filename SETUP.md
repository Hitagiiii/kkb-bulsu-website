# Setup checklist

## 1. Database updates (Supabase → SQL Editor, run each file once, in this order)
1. `supabase/013_member_details.sql`: college, program and year/section on sign-up.
2. `supabase/014_merch_photos_removals.sql`: merch photos, removing orders, declining applicants.
3. `supabase/015_stock_waitlist_deactivate_notifications.sql`: stock limits and waitlist, deactivating members, in-app notifications.

All three are safe to run again.

## 2. Password-reset link (Supabase dashboard, cannot be done from code)
Without this, the link in the "Forgot password?" email is rejected.

1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: your deployed address, for example `https://kkb-bulsu.vercel.app`.
3. **Redirect URLs** → Add URL, add both:
   - `https://YOUR-SITE-ADDRESS/reset-password`
   - `http://localhost:5173/reset-password` (only for local development)
4. Save.
5. In your hosting settings (Vercel / Netlify / etc.) add the environment variable `VITE_SITE_URL` with the same deployed address (no trailing slash) and redeploy. See `.env.example`.

Supabase's built-in email sender is limited to a few emails per hour. For real use, set up your own SMTP under
**Authentication → Emails → SMTP Settings** (any provider, e.g. Resend, Brevo, Gmail SMTP).

## 3. Notifications
- In-app notifications work after step 1. The bell updates live because the SQL adds the table to the `supabase_realtime` publication. If it does not, check **Database → Replication** and switch on `notifications`.
- Optional e-mail copy: see the header of `supabase/functions/send-notification-email/index.ts`. It needs a Resend account and a sender address. It has not been tested in this project.
