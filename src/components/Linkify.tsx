const URL_RE = /(https?:\/\/[^\s<]+)/g

/** Turns web links in plain text into clickable links, without touching any HTML. */
export default function Linkify({ text }: { text: string }) {
  // split() with a capture group puts the matched links at the odd positions
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part
        const url = part.replace(/[.,;:!?)\]]+$/, '')
        const trailing = part.slice(url.length)
        return (
          <span key={i}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 underline underline-offset-2 break-all hover:text-brand-800"
            >
              {url}
            </a>
            {trailing}
          </span>
        )
      })}
    </>
  )
}
