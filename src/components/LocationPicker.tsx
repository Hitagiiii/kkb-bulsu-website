import { useState } from 'react'
import MapView from './MapView'
import { subtleButtonClass } from './ui'

interface Place {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

/** Search for a place, tap the map, or use your own location to set the pin. */
export default function LocationPicker({
  lat,
  lng,
  onChange,
  onPlaceName,
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number | null, lng: number | null) => void
  onPlaceName?: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function search() {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setNote(null)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ph&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!res.ok) throw new Error('search failed')
      const found = (await res.json()) as Place[]
      setResults(found)
      if (found.length === 0) setNote('No places found. Try a different name, or tap the map to drop a pin.')
    } catch {
      setNote('The place search is not available right now. You can still tap the map to drop a pin.')
    } finally {
      setSearching(false)
    }
  }

  function pickPlace(p: Place) {
    onChange(parseFloat(p.lat), parseFloat(p.lon))
    onPlaceName?.(p.display_name.split(',').slice(0, 2).join(',').trim())
    setResults([])
    setNote(null)
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setNote('Your browser cannot share its location.')
    setNote('Finding your location…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude)
        setNote(null)
      },
      () => setNote('Could not get your location. Check that location access is allowed.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          aria-label="Search for a place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
          placeholder="Search a place, e.g. Malolos Cathedral"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm"
        />
        <button type="button" onClick={() => void search()} disabled={searching} className={subtleButtonClass}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white text-sm">
          {results.map((p) => (
            <li key={p.place_id}>
              <button
                type="button"
                onClick={() => pickPlace(p)}
                className="block w-full px-3 py-2.5 text-left break-words hover:bg-slate-50"
              >
                {p.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-2 text-xs text-slate-600">{note}</p>}

      <MapView
        lat={lat}
        lng={lng}
        onPick={(a, b) => onChange(a, b)}
        className="mt-3 h-64 w-full rounded-lg border border-slate-200"
      />

      <p className="mt-2 text-xs text-slate-500">
        Tap the map to drop a pin, then drag the pin to adjust it.
        {lat != null && lng != null && ` Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}.`}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={useMyLocation} className={subtleButtonClass}>
          Use my location
        </button>
        {lat != null && (
          <button type="button" onClick={() => onChange(null, null)} className={subtleButtonClass}>
            Remove pin
          </button>
        )}
      </div>
    </div>
  )
}
