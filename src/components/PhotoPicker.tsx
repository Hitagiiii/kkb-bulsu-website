import { useEffect, useState } from 'react'
import { MAX_MERCH_PHOTOS, merchPhotoUrls } from '../lib/merchImages'

function Preview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return (
    <li className="w-24">
      {src ? <img src={src} alt="New photo preview" className="h-24 w-24 rounded-md border border-line object-cover" /> : <div className="h-24 w-24 rounded-md bg-secondary" />}
      <button type="button" onClick={onRemove} className="mt-1 min-h-11 py-2 text-xs text-muted underline underline-offset-2 hover:text-accent">
        Remove
      </button>
    </li>
  )
}

/**
 * Pick up to four photos for a merch item. `saved` are photos already stored (edit mode);
 * the parent keeps both lists and decides what to upload or delete on save.
 */
export default function PhotoPicker({
  id,
  saved = [],
  files,
  onSavedChange,
  onFilesChange,
}: {
  id: string
  saved?: string[]
  files: File[]
  onSavedChange?: (paths: string[]) => void
  onFilesChange: (files: File[]) => void
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)
  const total = saved.length + files.length
  const room = MAX_MERCH_PHOTOS - total
  const key = saved.join('|')

  useEffect(() => {
    let cancelled = false
    if (saved.length) void merchPhotoUrls(saved).then((u) => !cancelled && setUrls(u))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function pick(list: FileList | null) {
    const images = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
    const accepted = images.slice(0, Math.max(room, 0))
    onFilesChange([...files, ...accepted])
    setNote(images.length > accepted.length ? `Only ${MAX_MERCH_PHOTOS} photos fit on one item, so ${images.length - accepted.length} were skipped.` : null)
  }

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        Photos ({total} of {MAX_MERCH_PHOTOS})
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple
        disabled={room <= 0}
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
        className="mt-1 block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2.5 file:text-sm file:font-semibold hover:file:bg-bg disabled:opacity-60"
      />
      <p className="mt-1 text-xs text-muted">The first photo is the cover members see in the shop.</p>
      {note && <p className="mt-1 text-xs text-[#6b5320]">{note}</p>}
      {total > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {saved.map((p, i) => (
            <li key={p} className="w-24">
              {urls[p] ? <img src={urls[p]} alt="Saved photo" className="h-24 w-24 rounded-md border border-line object-cover" /> : <div className="h-24 w-24 rounded-md bg-secondary" />}
              {i === 0 && files.length === 0 && <span className="mt-1 block text-[11px] font-semibold text-accent">Cover</span>}
              <button type="button" onClick={() => onSavedChange?.(saved.filter((x) => x !== p))} className="mt-1 min-h-11 py-2 text-xs text-muted underline underline-offset-2 hover:text-accent">
                Remove
              </button>
            </li>
          ))}
          {files.map((f, i) => (
            <Preview key={`${f.name}-${f.size}-${i}`} file={f} onRemove={() => onFilesChange(files.filter((_, idx) => idx !== i))} />
          ))}
        </ul>
      )}
    </div>
  )
}
