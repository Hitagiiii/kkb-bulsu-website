export default function FullScreenMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      {text}
    </div>
  )
}
