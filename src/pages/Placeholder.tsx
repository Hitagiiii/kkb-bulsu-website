export default function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-600">{description}</p>
      <p className="mt-8 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
        This page is built in a later step.
      </p>
    </div>
  )
}
