import { useEffect, useState } from 'react';
import { API_BASE, api, caseTone, type QueueItem } from '../api';
import { Badge, Button, Card, CopyCommand, Empty, rupees } from '../ui';

const CONFIG_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'FOLLOWUP_INITIAL_DELAY_SECONDS', label: 'First check after (s)', hint: 'Delay before check 1' },
  { key: 'FOLLOWUP_RETRY_BACKOFF_SECONDS', label: 'Retry backoff (s)', hint: 'Retry n waits n × this' },
  { key: 'CASE_VERIFICATION_MAX_ATTEMPTS', label: 'Max checks', hint: 'Then hand off to a human (new tasks)' },
  { key: 'WORKER_POLL_SECONDS', label: 'Worker poll (s)', hint: 'How often the worker scans' },
  { key: 'MOCK_BILLER_POSTS_ON_ATTEMPT', label: 'Biller posts on check', hint: '0 = never → handoff' },
  { key: 'MOCK_REFUND_COMPLETES_ON_ATTEMPT', label: 'Refund credits on check', hint: '0 = never → handoff' },
  { key: 'HANDOFF_UPDATE_MINUTES', label: 'Handoff update every (min)', hint: 'Reassure customer while a specialist works' },
  { key: 'HANDOFF_MAX_UPDATES', label: 'Max handoff updates', hint: 'Per escalation' },
];

type Props = { customerId: string; toast: (m: string) => void };

export default function QueueTab({ customerId, toast }: Props) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [config, setConfig] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [mine, setMine] = useState(false);

  const load = async () => {
    try {
      const data = await api.get<{ items: QueueItem[]; config: Record<string, number> }>(
        `/api/queue${mine ? `?customer_id=${customerId}` : ''}`);
      setItems(data.items);
      setConfig(data.config);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [mine, customerId]);

  const act = async (id: string, action: 'run-now' | 'cancel') => {
    try {
      await api.post(`/api/queue/${id}/${action}`);
      toast(action === 'run-now' ? `${id} is due now` : `${id} cancelled`);
    } catch (e) {
      toast(`${id}: ${e}`);
    }
    load();
  };

  const save = async () => {
    const body = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
    try {
      setConfig(await api.put('/api/queue/config', body));
      setDraft({});
      toast('Applied to the running worker (resets to .env on restart)');
    } catch (e) {
      toast(`Invalid config: ${e}`);
    }
  };

  const pending = items.filter(i => i.status === 'PENDING').length;

  return (
    <div className="space-y-5">
      <Card
        title={<span>Verification queue <span className="font-normal text-slate-400">· {pending} pending</span></span>}
        actions={
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {[false, true].map(v => (
              <button key={String(v)} onClick={() => setMine(v)}
                className={`rounded-md px-2.5 py-1 ${mine === v ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                {v ? customerId : 'All customers'}
              </button>
            ))}
          </div>
        }
      >
        {items.length === 0 ? (
          <Empty>Queue is empty. Run a failed or delayed-payment scenario: the agent queues a check here.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  {['Check', 'Customer · payment', 'Progress', 'Next', 'If not confirmed', ''].map(h => (
                    <th key={h} className="px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(q => {
                  const isPending = q.status === 'PENDING';
                  return (
                    <tr key={q.id} className={isPending ? '' : 'text-slate-400'}>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs">{q.id}</div>
                        <div className="text-[11px] text-slate-400">{q.verification_type === 'REVERSAL_STATUS_CHECK' ? 'Refund credit' : 'Biller posting'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium">{q.customer_id} · {q.biller_name}</div>
                        <div className="text-[11px] text-slate-400">{rupees(q.amount_rs)} · {q.payment_id} · {q.case_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="mb-1 flex gap-1">
                          {Array.from({ length: q.max_attempts }, (_, i) => (
                            <span key={i} className={`h-1.5 w-6 rounded-full ${
                              i < q.attempt_number - 1 ? 'bg-amber-400'
                                : i === q.attempt_number - 1 && q.status === 'EXECUTED' ? 'bg-emerald-500'
                                : i === q.attempt_number - 1 && isPending ? 'bg-sky-300' : 'bg-slate-200'}`} />
                          ))}
                        </div>
                        <Badge tone={caseTone(q.status)}>{q.status.toLowerCase()}</Badge>{' '}
                        <Badge tone={caseTone(q.case_status)}>case {q.case_status.toLowerCase()}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {isPending
                          ? <><div className="font-semibold text-slate-800">{q.seconds_until_due ? `check ${q.attempt_number} in ${q.seconds_until_due}s` : `check ${q.attempt_number} due now`}</div>
                              <div className="text-[11px] text-slate-400">{new Date(q.due_at).toLocaleTimeString()}</div></>
                          : q.completed_at ? new Date(q.completed_at).toLocaleTimeString() : '–'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {!isPending ? '–' : q.next_retry_delay_seconds != null ? `retry in ${q.next_retry_delay_seconds}s` : 'hand off to human'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPending && (
                          <div className="flex justify-end gap-1.5">
                            <Button onClick={() => act(q.id, 'run-now')}>Run now</Button>
                            <Button variant="danger" onClick={() => act(q.id, 'cancel')}>Cancel</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Retry settings" actions={
          <>
            <Button onClick={() => setDraft({})} disabled={!Object.keys(draft).length}>Reset</Button>
            <Button variant="primary" onClick={save} disabled={!Object.keys(draft).length}>Apply</Button>
          </>
        }>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
            {CONFIG_FIELDS.map(f => (
              <label key={f.key} className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-xs font-medium text-slate-700">{f.label}</span>
                  <span className="block text-[11px] text-slate-400">{f.hint}</span>
                </span>
                <input
                  type="number" min={0}
                  value={draft[f.key] ?? String(config[f.key] ?? '')}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-sky-400"
                />
              </label>
            ))}
          </div>
          <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">
            Live until the backend restarts. Permanent defaults live in <code>.env</code> under the same names.
          </p>
        </Card>

        <Card title="Same controls via curl">
          <div className="space-y-3 p-4">
            <CopyCommand label="Pending checks" command={`curl -s "${API_BASE}/api/queue?status=PENDING"`} onCopied={() => toast('Copied')} />
            <CopyCommand label="Change settings" command={`curl -s -X PUT ${API_BASE}/api/queue/config -H 'Content-Type: application/json' -d '{"FOLLOWUP_RETRY_BACKOFF_SECONDS": 10}'`} onCopied={() => toast('Copied')} />
            <CopyCommand label="Run a check now" command={`curl -s -X POST ${API_BASE}/api/queue/<CHECK_ID>/run-now`} onCopied={() => toast('Copied')} />
          </div>
        </Card>
      </div>
    </div>
  );
}
