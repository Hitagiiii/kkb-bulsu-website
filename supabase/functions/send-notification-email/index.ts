// OPTIONAL: e-mail copy of every in-app notification.
// NOT TESTED in this project. Needs a Resend account (resend.com) and a sender address you control.
//
// Setup (Supabase dashboard / CLI):
//   1. supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="KKB BULSU <no-reply@yourdomain.org>" SITE_URL=https://your-site
//   2. supabase functions deploy send-notification-email --no-verify-jwt
//   3. Database -> Webhooks -> Create: table `notifications`, event INSERT,
//      type "Supabase Edge Function", pick send-notification-email.
//
// The webhook sends { type: 'INSERT', record: { user_id, title, body, link, ... } }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

Deno.serve(async (req) => {
  try {
    const { record } = await req.json()
    if (!record?.user_id) return new Response('no record', { status: 400 })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await admin.auth.admin.getUserById(record.user_id)
    const to = data?.user?.email
    if (error || !to) return new Response('no email for user', { status: 200 })

    const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;color:#242220">
      <p style="color:#8a1c2e;font-weight:700;margin:0 0 12px">KKB BULSU</p>
      <h2 style="margin:0 0 8px;font-weight:500">${esc(record.title)}</h2>
      <p style="margin:0 0 16px;color:#746f69">${esc(record.body ?? '')}</p>
      ${record.link && site ? `<a href="${site}${record.link}" style="background:#8a1c2e;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the portal</a>` : ''}
    </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('MAIL_FROM'), to, subject: record.title, html }),
    })
    return new Response(await res.text(), { status: res.ok ? 200 : 502 })
  } catch (e) {
    return new Response(String(e), { status: 500 })
  }
})
