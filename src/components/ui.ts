// text-base on small screens stops iPhones from zooming into inputs
export const inputClass =
  'mt-1 block w-full rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink sm:py-2 sm:text-sm ' +
  'placeholder:text-ash focus:border-accent focus:outline-none focus:ring-2 focus:ring-soft'

/** Primary action: maroon. One per view where possible. */
export const buttonClass =
  'inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-sm font-semibold sm:py-2.5 ' +
  'text-white transition-colors hover:bg-brand-800 active:bg-brand-800 ' +
  'disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted'

/** Secondary action: white with a hairline border. */
export const subtleButtonClass =
  'inline-flex items-center justify-center rounded-md border border-line bg-white px-4 py-2.5 text-sm sm:py-2 ' +
  'font-semibold text-ink transition-colors hover:bg-bg active:bg-bg ' +
  'disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted'

/** Destructive or quiet-danger action: soft maroon. */
export const dangerButtonClass =
  'inline-flex items-center justify-center rounded-md bg-soft px-4 py-2.5 text-sm sm:py-2 ' +
  'font-semibold text-accent transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50'

/** White card on the cream page. */
export const cardClass = 'rounded-md border border-line bg-white'

/** Tiny uppercase maroon label that sits above a heading. */
export const eyebrowClass = 'text-[11px] font-semibold tracking-[0.08em] text-accent uppercase'

/** A plain inline notice. Add spacing and layout next to it. */
export const noticeClass = 'border-l-4 border-accent bg-soft px-4 py-3 text-sm font-medium text-ink'
