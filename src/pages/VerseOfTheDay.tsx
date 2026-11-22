import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { hasRole } from '../lib/types'
import { supabase } from '../lib/supabase'
import { fetchDailyVerse } from '../lib/dailyVerse'
import { cardClass, buttonClass, inputClass, subtleButtonClass, eyebrowClass } from '../components/ui'
import PageHeader from '../components/PageHeader'

interface DailyVerseRow {
  date: string
  reference: string
  verse_text: string
  translation: string
  reflection: string | null
  prayer: string | null
  published: boolean
  created_at: string
  updated_at: string | null
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function displayDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function VerseOfTheDay() {
  const { profile } = useAuth()
  const canManage = hasRole(profile?.role, 'officer')
  const [today, setToday] = useState<DailyVerseRow | null>(null)
  const [archive, setArchive] = useState<DailyVerseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reflection, setReflection] = useState('')
  const [prayer, setPrayer] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const currentDate = todayKey()
    const existing = await supabase.from('daily_verses').select('*').eq('date', currentDate).maybeSingle()

    if (existing.error) {
      setError(existing.error.message)
      setLoading(false)
      return
    }

    let row = existing.data as DailyVerseRow | null
    if (!row) {
      try {
        const generated = await fetchDailyVerse()
        const inserted = await supabase
          .from('daily_verses')
          .insert({
            date: generated.date,
            reference: generated.reference,
            verse_text: generated.text,
            translation: generated.translation,
            published: true,
          })
          .select('*')
          .single()

        if (inserted.error) {
          const raced = await supabase.from('daily_verses').select('*').eq('date', currentDate).maybeSingle()
          if (raced.error || !raced.data) {
            setError(inserted.error.message)
            setLoading(false)
            return
          }
          row = raced.data as DailyVerseRow
        } else {
          row = inserted.data as DailyVerseRow
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not generate today’s verse.')
        setLoading(false)
        return
      }
    }

    setToday(row)
    setReflection(row.reflection ?? '')
    setPrayer(row.prayer ?? '')

    const history = await supabase
      .from('daily_verses')
      .select('*')
      .lte('date', currentDate)
      .order('date', { ascending: false })
      .limit(30)

    if (!history.error) setArchive((history.data ?? []) as DailyVerseRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('verse-of-the-day')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_verses' }, () => void load())
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [load])


  async function saveReflection() {
    if (!today) return
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('daily_verses')
      .update({ reflection: reflection.trim() || null, prayer: prayer.trim() || null })
      .eq('date', today.date)
    setSaving(false)
    if (updateError) return setError(updateError.message)
    await load()
  }

  const archiveRows = useMemo(() => archive.filter((row) => row.date !== today?.date), [archive, today?.date])

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Daily devotion"
        title="Verse of the Day"
        subtitle="A Scripture reading and KKB BULSU reflection for today."
      />

      {error && <p role="alert" className="mt-6 border-l-2 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}
      {loading && <p className="mt-6 text-sm text-muted">Preparing today’s verse…</p>}

      {!loading && today && (
        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-7">
            <article className={cardClass + ' overflow-hidden'}>
              <div className="border-b border-line bg-soft px-5 py-4 sm:px-7">
                <p className={eyebrowClass}>Today · {displayDate(today.date)}</p>
                <p className="mt-1 text-xs text-muted">{today.translation} · Bible verse</p>
              </div>
              <div className="px-5 py-7 sm:px-8 sm:py-9">
                <blockquote className="font-display max-w-3xl text-2xl leading-relaxed text-ink sm:text-4xl">
                  “{today.verse_text}”
                </blockquote>
                <p className="mt-5 text-sm font-semibold text-brand-700">— {today.reference}</p>
                <p className="mt-3 text-xs text-muted">Scripture source: Free Use Bible API · Berean Standard Bible</p>
              </div>
            </article>

            <section className={cardClass + ' p-5 sm:p-7'} aria-labelledby="reflection-heading">
              <p className={eyebrowClass}>Today’s reflection</p>
              <h2 id="reflection-heading" className="mt-1 text-2xl font-medium text-ink">Faith in the middle of university life.</h2>
              {today.reflection ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-umber sm:text-base">{today.reflection}</p>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted">The KKB reflection is being prepared. The Scripture above is available to read and reflect on today.</p>
              )}
            </section>

            {today.prayer && (
              <section className={cardClass + ' border-brand-200 p-5 sm:p-7'} aria-labelledby="prayer-heading">
                <p className={eyebrowClass}>Today’s prayer</p>
                <h2 id="prayer-heading" className="mt-1 text-xl font-medium text-ink">A moment to pray.</h2>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-umber sm:text-base">{today.prayer}</p>
              </section>
            )}
          </div>

          <aside className="space-y-5">
            {canManage && (
              <section className={cardClass + ' p-5'} aria-labelledby="manage-heading">
                <p className={eyebrowClass}>Officer tools</p>
                <h2 id="manage-heading" className="mt-1 text-lg font-semibold text-ink">Manage today’s reflection</h2>
                <label className="mt-4 block text-sm font-medium text-ink">
                  Reflection
                  <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={7} className={inputClass + ' resize-y'} placeholder="Write a short KKB-centered reflection…" />
                </label>
                <label className="mt-3 block text-sm font-medium text-ink">
                  Prayer <span className="font-normal text-muted">(optional)</span>
                  <textarea value={prayer} onChange={(e) => setPrayer(e.target.value)} rows={5} className={inputClass + ' resize-y'} placeholder="Write a short prayer…" />
                </label>
                <button type="button" onClick={() => void saveReflection()} disabled={saving} className={buttonClass + ' mt-4 min-h-11'}>
                  {saving ? 'Saving…' : 'Save reflection'}
                </button>
              </section>
            )}

            <section className={cardClass + ' p-5'} aria-label="Previous verses">
              <p className={eyebrowClass}>Previous verses</p>
              {archiveRows.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Previous devotionals will appear here as they are published.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {archiveRows.map((row) => (
                    <li key={row.date} className="py-3 first:pt-1">
                      <p className="text-xs text-muted">{displayDate(row.date)}</p>
                      <p className="mt-1 text-sm font-semibold text-ink">{row.reference}</p>
                      {row.reflection && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{row.reflection}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <a href="https://bible.helloao.org/" target="_blank" rel="noreferrer" className={subtleButtonClass + ' min-h-11 w-full'}>
              About the Bible source ↗
            </a>
          </aside>
        </div>
      )}
    </div>
  )
}
