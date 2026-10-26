import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { API_BASE, api, type LogEntry, type Trace } from '../api';
import { Badge, Button, Card, Empty, timeAgo } from '../ui';

const FILTERS: Array<{ id: string; label: string; match: (c: string) => boolean }> = [
  { id: 'ALL', label: 'All', match: () => true },
  { id: 'AGENT', label: 'Agents', match: c => /AGENT|LLM|ROUTING|USER/.test(c) },
  { id: 'TOOL', label: 'Tools & DB', match: c => c.includes('TOOL') },
  { id: 'WORKER', label: 'Worker & queue', match: c => /WORKER|HANDOFF|ESCALATION|CASE/.test(c) },
  { id: 'POLICY', label: 'Policy', match: c => c.includes('POLICY') },
  { id: 'RAZORPAY', label: 'Razorpay', match: c => c.includes('RAZORPAY') },
  { id: 'WHATSAPP', label: 'WhatsApp', match: c => c.includes('WHATSAPP') },
  { id: 'EVENT', label: 'Events', match: c => /EVENT|PII/.test(c) },
];

const toneFor = (c: string) =>
  /WHATSAPP/.test(c) ? 'green' : /RAZORPAY/.test(c) ? 'blue' : /ERROR/.test(c) ? 'red' : /POLICY|ESCALATION|HANDOFF/.test(c) ? 'amber' : /AGENT|LLM|ROUTING/.test(c) ? 'blue' : /RESOLVED/.test(c) ? 'green' : 'slate';

export default function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [inspect, setInspect] = useState<Trace | null>(null);

  useEffect(() => {
    api.get<{ logs: LogEntry[] }>('/api/logs?limit=200').then(d => setLogs([...d.logs].reverse())).catch(() => {});
    const es = new EventSource(`${API_BASE}/api/logs/stream`);
    es.addEventListener('log', ev => {
      try {
        const l: LogEntry = JSON.parse((ev as MessageEvent).data);
        setLogs(prev => (prev.some(p => p.id === l.id) ? prev : [l, ...prev].slice(0, 300)));
      } catch {}
    });
    return () => es.close();
  }, []);

  useEffect(() => {
    const load = () => api.get<{ traces: Trace[] }>('/api/traces?limit=40').then(d => setTraces(d.traces || [])).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const match = FILTERS.find(f => f.id === filter)!.match;
  const visible = logs.filter(l => match((l.category || '').toUpperCase()));

  const turns = traces.filter(t => t.name === 'customer_support_turn');
  const avg = turns.length ? Math.round(turns.reduce((a, t) => a + t.latency_ms, 0) / turns.length) : null;
  const replies = traces.filter(t => t.name === 'communicator_reply');
  const llm = replies.filter(t => t.metadata?.source === 'LLM').length;

  return (
    <div className="space-y-5">
      <Card
        title="Live log stream"
        actions={
          <>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`rounded-md px-2 py-1 text-[11px] ${filter === f.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => api.del('/api/logs').then(() => setLogs([])).catch(() => {})}>Clear</Button>
          </>
        }
      >
        <div className="max-h-[420px] overflow-y-auto font-mono text-xs">
          {visible.length === 0 ? <Empty>No logs yet. Run a scenario or send a chat message.</Empty> : visible.map(l => (
            <div key={l.id} className="border-b border-slate-50 px-4 py-1.5 hover:bg-slate-50">
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-slate-400">{l.time}</span>
                <Badge tone={toneFor(l.category)}>{l.category}</Badge>
                <span className="min-w-0 flex-1 break-words text-slate-700">{l.msg}</span>
                {l.meta && Object.keys(l.meta).length > 0 && (
                  <button onClick={() => setOpen(open === l.id ? null : l.id)} className="shrink-0 text-[11px] text-sky-700">
                    {open === l.id ? 'hide' : 'details'}
                  </button>
                )}
              </div>
              {open === l.id && <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-emerald-300">{JSON.stringify(l.meta, null, 2)}</pre>}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={<span>Agent traces <span className="font-normal text-slate-400">· avg turn {avg != null ? `${avg} ms` : '–'} · {replies.length ? `${llm}/${replies.length} replies by LLM` : 'no replies yet'}</span></span>}
        actions={<a href="https://www.comet.com/opik" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline">Opik <ExternalLink className="h-3 w-3" /></a>}
      >
        {traces.length === 0 ? <Empty>No traces yet</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  {['Step', 'Actor', 'Case', 'Latency', 'When', ''].map(h => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {traces.map(t => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-xs font-medium text-slate-700">{t.name.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{t.actor_role.toLowerCase()}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">{t.case_id || '–'}</td>
                    <td className="px-4 py-2 text-xs">{t.latency_ms} ms</td>
                    <td className="px-4 py-2 text-xs text-slate-400">{timeAgo(t.created_at)}</td>
                    <td className="px-4 py-2 text-right"><Button variant="ghost" onClick={() => setInspect(t)}>Inspect</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {inspect && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={() => setInspect(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{inspect.name.replaceAll('_', ' ')}</h3>
              <Button onClick={() => setInspect(null)}>Close</Button>
            </div>
            {(['input', 'output', 'metadata'] as const).map(k => (
              <div key={k} className="mb-4">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{k}</div>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-emerald-300">{JSON.stringify(inspect[k], null, 2)}</pre>
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}
