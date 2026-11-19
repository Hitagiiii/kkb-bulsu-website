// text-base on small screens stops iPhones from zooming into inputs
export const inputClass =
  'mt-1 block w-full rounded-md border border-ash bg-white px-3 py-2.5 text-base text-ink sm:py-2 sm:text-sm ' +
  'placeholder:text-ash focus:border-ink focus:outline-none focus:ring-2 focus:ring-gold-400'

/** Primary action. One per view where possible. */
export const buttonClass =
  'inline-flex w-full items-center justify-center rounded-md bg-brand-700 px-4 py-3 text-sm font-bold sm:py-2.5 ' +
  'text-white transition-colors hover:bg-brand-800 active:bg-brand-800 ' +
  'disabled:cursor-not-allowed disabled:bg-card disabled:text-ash'

/** Secondary action. */
export const subtleButtonClass =
  'inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2.5 text-sm sm:py-2 ' +
  'font-bold text-ink transition-colors hover:bg-secondary-pressed active:bg-secondary-pressed ' +
  'disabled:cursor-not-allowed disabled:bg-card disabled:text-ash'

/** A plain inline notice. Replaces the amber banners. Add spacing and layout next to it. */
export const noticeClass = 'border-l-4 border-brand-700 bg-card px-4 py-3 text-sm font-medium text-ink'
