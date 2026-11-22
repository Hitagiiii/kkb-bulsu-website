export interface DailyVerseSource {
  reference: string
  text: string
  translation: string
  sourceUrl: string
}

interface VerseCandidate {
  book: string
  chapter: number
  verse: number
  endVerse?: number
  addedIn?: number
  removedIn?: number
  categories?: string[]
}

interface VerseDatasetResponse {
  verses: VerseCandidate[]
  holidays?: Array<{
    id: string
    name: string
    month?: number
    day?: number
    dates?: string[]
  }>
}

interface ChapterResponse {
  book: { name: string }
  chapter: {
    content: Array<{
      type: string
      number?: number
      text?: string
    }>
  }
}

const API_ROOT = 'https://bible.helloao.org/api'
const TRANSLATION = 'BSB'
const SOURCE_URL = 'https://bible.helloao.org/'

let verseListPromise: Promise<VerseDatasetResponse> | null = null

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1)
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor((current.getTime() - start.getTime()) / 86400000) + 1
}

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function activeCandidates(candidates: VerseCandidate[], year: number): VerseCandidate[] {
  return candidates.filter((verse) => (!verse.addedIn || verse.addedIn <= year) && (!verse.removedIn || verse.removedIn > year))
}

async function getVerseCandidates(): Promise<VerseDatasetResponse> {
  if (!verseListPromise) {
    verseListPromise = fetch(`${API_ROOT}/d/verse-of-the-day/verses.json`, { cache: 'force-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the daily verse list.')
        return (await response.json()) as VerseDatasetResponse
      })
      .catch((error) => {
        verseListPromise = null
        throw error
      })
  }
  return verseListPromise
}

function findHoliday(catalog: VerseDatasetResponse, date: Date) {
  const key = getLocalDateKey(date)
  return (catalog.holidays ?? []).find((holiday) =>
    holiday.dates?.includes(key) || (holiday.month === date.getMonth() + 1 && holiday.day === date.getDate()),
  )
}

function pickCandidate(catalog: VerseDatasetResponse, date: Date): VerseCandidate {
  const year = date.getFullYear()
  const holiday = findHoliday(catalog, date)
  const candidates = activeCandidates(catalog.verses, year)

  if (holiday) {
    const holidayCandidates = candidates.filter((verse) => verse.removedIn !== year && verse.categories?.includes(holiday.id))
    if (holidayCandidates.length > 0) {
      return holidayCandidates[year % holidayCandidates.length]
    }
  }

  const ordered = [...candidates].sort((a, b) => {
    const aKey = `${year}:${a.book}:${a.chapter}:${a.verse}:${a.endVerse ?? ''}`
    const bKey = `${year}:${b.book}:${b.chapter}:${b.verse}:${b.endVerse ?? ''}`
    return hash(aKey) - hash(bKey)
  })
  return ordered[(dayOfYear(date) - 1) % ordered.length]
}

export async function fetchDailyVerse(date = new Date()): Promise<DailyVerseSource & { date: string }> {
  const catalog = await getVerseCandidates()
  const candidate = pickCandidate(catalog, date)
  const response = await fetch(`${API_ROOT}/${TRANSLATION}/${candidate.book}/${candidate.chapter}.simple.json`, { cache: 'force-cache' })
  if (!response.ok) throw new Error('Could not load the Bible passage.')

  const chapter = (await response.json()) as ChapterResponse
  const verses = chapter.chapter.content
    .filter((item) => item.type === 'verse' && typeof item.number === 'number' && typeof item.text === 'string')
    .filter((item) => item.number! >= candidate.verse && item.number! <= (candidate.endVerse ?? candidate.verse))

  if (verses.length === 0) throw new Error('The selected Bible passage could not be found.')

  const reference = `${chapter.book.name} ${candidate.chapter}:${candidate.verse}${candidate.endVerse ? `–${candidate.endVerse}` : ''}`
  return {
    date: getLocalDateKey(date),
    reference,
    text: verses.map((verse) => verse.text!.trim()).join(' '),
    translation: TRANSLATION,
    sourceUrl: SOURCE_URL,
  }
}
