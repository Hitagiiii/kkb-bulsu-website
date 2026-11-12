import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Near Malolos City. Only used when no pin is set yet.
const DEFAULT_CENTER: [number, number] = [14.85, 120.8167]

const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">' +
  '<path d="M16 0C7.2 0 0 7.1 0 15.9 0 27.5 16 42 16 42s16-14.5 16-26.1C32 7.1 24.8 0 16 0z" fill="#8a1c2e"/>' +
  '<circle cx="16" cy="16" r="6" fill="#ffffff"/></svg>'

const pinIcon = L.divIcon({
  className: 'kkb-pin',
  html: PIN_SVG,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
})

interface Props {
  lat: number | null
  lng: number | null
  /** When given, the map is a picker: tap to place the pin, drag it to adjust */
  onPick?: (lat: number, lng: number) => void
  className?: string
}

/** A free OpenStreetMap map with one pin. No API key needed. */
export default function MapView({ lat, lng, onPick, className }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onPickRef = useRef(onPick)

  useEffect(() => {
    onPickRef.current = onPick
  })

  // Create the map once
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const hasPin = lat != null && lng != null
    const map = L.map(el, {
      scrollWheelZoom: false, // so scrolling the page doesn't get stuck on the map
      dragging: !L.Browser.mobile, // phones pan with two fingers, so one finger still scrolls the page
    }).setView(hasPin ? [lat, lng] : DEFAULT_CENTER, hasPin ? 16 : 14)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng))

    const resizer = new ResizeObserver(() => map.invalidateSize())
    resizer.observe(el)

    mapRef.current = map
    return () => {
      resizer.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; the effect below follows lat/lng
  }, [])

  // Keep the pin in sync
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (lat == null || lng == null) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      const marker = L.marker([lat, lng], { icon: pinIcon, draggable: !!onPickRef.current }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onPickRef.current?.(p.lat, p.lng)
      })
      markerRef.current = marker
    } else {
      markerRef.current.setLatLng([lat, lng])
    }
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [lat, lng])

  return <div ref={elRef} className={'isolate ' + (className ?? 'h-64 w-full')} />
}
