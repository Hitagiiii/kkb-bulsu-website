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
    <section aria-label="Budget folder" className="mt-5 border-y border-hairline py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="budget-folder" className="text-sm font-semibold">Folder</label>
        <select id="budget-folder" value={current} onChange={(e) => void move(e.target.value)} className="min-h-11 min-w-44 border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm">
          <option value="">No folder</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
      </div>
    </section>
  )
}
