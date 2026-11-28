// text-base on small screens stops iPhones from zooming into inputs
export const inputClass =
  'mt-1 block min-h-11 w-full rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink sm:py-2 sm:text-sm ' +
  'placeholder:text-muted focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-soft'

/** Primary action: maroon. One per view where possible. */
export const buttonClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold ' +
  'text-white transition-colors hover:bg-brand-800 active:bg-brand-800 ' +
  'disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted'

/** Secondary action: white with a hairline border. */
export const subtleButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-line bg-white px-4 py-2.5 text-sm ' +
  'font-semibold text-ink transition-colors hover:bg-sand active:bg-sand ' +
  'disabled:cursor-not-allowed disabled:bg-sand disabled:text-muted'

/** Destructive or quiet-danger action: maroon tint. */
export const dangerButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-soft px-4 py-2.5 text-sm ' +
  'font-semibold text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50'

export const cardClass = 'rounded-md border border-line bg-white'

/** Small section label. Used only for real metadata, never as decoration. */
export const eyebrowClass = 'text-xs font-medium text-muted'

/** Time-sensitive notice: orange left rule, existing palette only. */
export const noticeClass = 'border-l-4 border-accent-500 bg-accent-100 px-4 py-3 text-sm font-medium text-ink'
