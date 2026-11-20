// Compact 20px glyphs for the collapsed sidebar rail. Keyed by route.
const PATHS: Record<string, string> = {
  '/': 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  '/announcements': 'M4 11v3a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6',
  '/events': 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  '/polls': 'M5 20V10M12 20V4M19 20v-7',
  '/attendance': 'M5 12l4 4 10-10',
  '/merch': 'M6 7l-3 3 3 2v8h12v-8l3-2-3-3-3 2a3 3 0 0 1-6 0z',
  '/documents': 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
  '/minutes': 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  '/tasks': 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  '/finance': 'M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.5 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3',
  '/merch/manage': 'M4 7h16M4 12h16M4 17h10',
  '/members': 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M21 20a5 5 0 0 0-4-4.9',
}

export default function NavIcon({ to }: { to: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={PATHS[to] ?? 'M4 12h16'} />
    </svg>
  )
}
