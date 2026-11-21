import { useEffect, useState } from 'react'
import { merchPhotoUrls } from '../lib/merchImages'
import { ProductArt } from './Icons'

/**
 * The photo of a merch item. Shows the first uploaded photo; with `gallery`, small thumbnails switch between photos.
 * Falls back to a flat icon tile until finance uploads a photo.
 */
export default function MerchPhoto({
  paths,
  name,
  category,
  className = 'aspect-square w-full',
  gallery = false,
}: {
  paths: string[]
  name: string
  category: string
  className?: string
  gallery?: boolean
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const key = paths.join('|')

  useEffect(() => {
    let cancelled = false
    if (paths.length === 0) return
    void merchPhotoUrls(paths).then((u) => {
      if (!cancelled) setUrls(u)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const shown = paths[Math.min(index, paths.length - 1)]
  const url = shown ? urls[shown] : undefined

  if (paths.length === 0) return <ProductArt category={category} name={name} className={className} />
  if (!url) return <div className={'animate-pulse bg-sand ' + className} aria-hidden="true" />

  return (
    <div>
      <img src={url} alt={name} loading="lazy" className={'bg-sand object-cover ' + className} />
      {gallery && paths.length > 1 && (
        <ul className="mt-2 flex gap-2" aria-label={`Photos of ${name}`}>
          {paths.map((p, i) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-pressed={i === index}
                className={'block overflow-hidden rounded-md border-2 ' + (i === index ? 'border-brand-700' : 'border-line')}
              >
                {urls[p] ? <img src={urls[p]} alt="" className="h-12 w-12 object-cover" /> : <span className="block h-12 w-12 bg-sand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
