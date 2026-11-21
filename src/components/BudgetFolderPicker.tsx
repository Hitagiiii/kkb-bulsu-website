import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/finance'
import type { Folder } from '../lib/folders'

/** Move a budget into one of the finance folders. */
export default function BudgetFolderPicker({ budgetId }: { budgetId: string }) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [current, setCurrent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [f, b] = await Promise.all([
      supabase.from('budget_folders').select('id, name').order('name'),
      supabase.from('budgets').select('folder_id').eq('id', budgetId).maybeSingle(),
    ])
    setFolders((f.data ?? []) as Folder[])
    setCurrent((b.data as { folder_id: string | null } | null)?.folder_id ?? '')
  }, [budgetId])

  useEffect(() => { void load() }, [load])

  async function move(id: string) {
    setError(null)
    const { error } = await supabase.from('budgets').update({ folder_id: id || null }).eq('id', budgetId)
    if (error) return setError(errorMessage(error, 'Could not move the budget.'))
    setCurrent(id)
  }

  return (
    <section aria-label="Budget folder" className="rounded-md border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">Organization</p><label htmlFor="budget-folder" className="mt-1 block text-base font-semibold">Budget folder</label><p className="mt-1 text-xs text-muted">Keep related budgets grouped together.</p></div>
        <select id="budget-folder" value={current} onChange={(e) => void move(e.target.value)} className="min-h-11 w-full rounded-md border border-line bg-paper px-3 py-2.5 text-base sm:w-56 sm:text-sm">
          <option value="">No folder</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {error && <span role="alert" className="text-sm text-brand-700">{error}</span>}
      </div>
    </section>
  )
}
