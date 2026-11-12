import { formatDate, peso, type Budget, type Expense } from '../lib/finance'

interface Props {
  budget: Budget
  expenses: Expense[]
  urls: Record<string, string>
  names: Record<string, string>
  spent: number
  left: number
}

const th = 'border border-black px-2 py-1 text-left font-semibold'
const td = 'border border-black px-2 py-1 align-top'

/** Only visible when printing. Rendered on the page, hidden on screen. */
export default function PrintBill({ budget, expenses, urls, names, spent, left }: Props) {
  const active = expenses
    .filter((e) => !e.voided_at)
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on) || a.created_at.localeCompare(b.created_at))
  const voided = expenses.filter((e) => e.voided_at)
  const withReceipts = active.map((e, i) => ({ e, n: i + 1 })).filter(({ e }) => e.receipt_path && urls[e.receipt_path])

  return (
    <div id="print-bill" className="hidden text-black print:block">
      <header className="border-b-2 border-black pb-3">
        <p className="text-sm">KKB BULSU</p>
        <h1 className="text-2xl font-bold">Statement of Expenses</h1>
        <p className="text-lg">{budget.name}</p>
        <p className="mt-1 text-sm">
          Printed on {new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}
        </p>
      </header>

      <table className="mt-5 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className={th}>Total budget</th>
            <td className={td + ' text-right'}>{peso(budget.total_budget)}</td>
          </tr>
          <tr>
            <th className={th}>Total expenses</th>
            <td className={td + ' text-right'}>{peso(spent)}</td>
          </tr>
          <tr>
            <th className={th}>{left < 0 ? 'Over budget by' : 'Remaining balance'}</th>
            <td className={td + ' text-right font-bold'}>{peso(Math.abs(left))}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-6 mb-2 text-base font-bold">Itemized expenses</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={th}>No.</th>
            <th className={th}>Date</th>
            <th className={th}>Description</th>
            <th className={th}>Category</th>
            <th className={th}>Receipt</th>
            <th className={th + ' text-right'}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {active.length === 0 && (
            <tr>
              <td className={td} colSpan={6}>No expenses recorded.</td>
            </tr>
          )}
          {active.map((e, i) => (
            <tr key={e.id} className="break-inside-avoid">
              <td className={td}>{i + 1}</td>
              <td className={td}>{formatDate(e.spent_on)}</td>
              <td className={td}>{e.description}</td>
              <td className={td}>{e.category}</td>
              <td className={td}>{e.receipt_path ? 'Attached' : 'None'}</td>
              <td className={td + ' text-right'}>{peso(e.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className={td + ' text-right font-bold'} colSpan={5}>Total</td>
            <td className={td + ' text-right font-bold'}>{peso(spent)}</td>
          </tr>
        </tbody>
      </table>

      {voided.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-base font-bold">Voided entries (not counted in the total)</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Description</th>
                <th className={th}>Amount</th>
                <th className={th}>Reason</th>
                <th className={th}>Voided by</th>
              </tr>
            </thead>
            <tbody>
              {voided.map((e) => (
                <tr key={e.id} className="break-inside-avoid">
                  <td className={td}>{e.description}</td>
                  <td className={td}>{peso(e.amount)}</td>
                  <td className={td}>{e.void_reason}</td>
                  <td className={td}>{e.voided_by ? names[e.voided_by] ?? '' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="mt-12 grid grid-cols-3 gap-8 break-inside-avoid text-sm">
        {['Prepared by (Finance)', 'Noted by (President)', 'Approved by (SCOM Head)'].map((label) => (
          <div key={label}>
            <div className="h-10 border-b border-black" />
            <p className="mt-1">{label}</p>
            <p className="text-xs">Date: ______________</p>
          </div>
        ))}
      </div>

      {withReceipts.length > 0 && (
        <section className="mt-10 break-before-page">
          <h2 className="mb-3 text-base font-bold">Receipts</h2>
          <div className="grid grid-cols-2 gap-4">
            {withReceipts.map(({ e, n }) => (
              <figure key={e.id} className="break-inside-avoid border border-black p-2">
                <img src={urls[e.receipt_path!]} alt={`Receipt for item ${n}`} className="max-h-96 w-full object-contain" />
                <figcaption className="mt-1 text-xs">
                  Item {n}: {e.description} ({peso(e.amount)})
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
