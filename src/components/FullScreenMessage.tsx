export default function FullScreenMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted">
      {text}
    </div>
  )
}
