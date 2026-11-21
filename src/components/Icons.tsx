import type { ReactNode } from 'react'

function Svg({ className, size = 18, children }: { className?: string; size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

type P = { className?: string; size?: number }

export const CalendarIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
)
export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
)
export const MapPinIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
)
export const VideoIcon = (p: P) => (
  <Svg {...p}>
    <path d="m22 8-6 4 6 4V8z" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </Svg>
)
export const FolderIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
  </Svg>
)
export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
)
export const ChevronRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
)
export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const MinusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)

/* ---------- big product art for the merch shop ---------- */
const ART: Record<string, ReactNode> = {
  shirt: (
    <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
  ),
  lace: (
    <>
      <path d="M8 2l4 7 4-7" />
      <rect x="6" y="9" width="12" height="13" rx="2" />
      <path d="M10 14h4M10 18h4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </>
  ),
  bag: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
}

function artKey(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('shirt')) return 'shirt'
  if (c.includes('lace') || c.includes('lanyard') || c.includes('id')) return 'lace'
  if (c.includes('pin')) return 'pin'
  return 'bag'
}

/** A flat tile with a large icon, shown when an item has no photo yet. */
export function ProductArt({
  category,
  className = 'aspect-[4/3] w-full',
}: {
  category: string
  /** kept so callers can pass the item name */
  name?: string
  className?: string
}) {
  const key = artKey(category)
  return (
    <div className={`flex items-center justify-center bg-sand text-brand-700 ${className}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-[45%] w-[45%]"
      >
        {ART[key]}
      </svg>
    </div>
  )
}
