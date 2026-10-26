import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api, OUTCOME_META, paymentStatus, type CaseEvent, type Outcome, type Ticket } from '../api';
import { Badge, Button, Card, Empty, rupees, timeAgo } from '../ui';

type GatewayTimeline = {
  order: { order_id: string; razorpay_payment_id: string | null; status: string; refund_id: string | null; refund_status: string | null; error: string | null } | null;
  events: Array<{ at: string; event: string; from: string | null; to: string; detail: Record<string, any> }>;
};

const TABS: Array<Outcome | 'ALL'> = ['ALL', 'NEEDS_HUMAN', 'IN_PROGRESS', 'AUTO_RESOLVED', 'HUMAN_RESOLVED'];

type Props = { initialOutcome?: Outcome; toast: (m: string) => void; openSpecialist: () => void };

export default function OpsTickets({ initialOutcome, toast, openSpecialist }: Props) {
  const [tab, setTab] = useState<Outcome | 'ALL'>(initialOutcome ?? 'ALL');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Outcome, number>>>({});
  const [open, setOpen] = useState<Ticket | null>(null);

  useEffect(() => { if (initialOutcome) setTab(initialOutcome); }, [initialOutcome]);

  useEffect(() => {
    const load = () => {
      const params = new URLSearchParams();
      if (tab !== 'ALL') params.set('outcome_filter', tab);
      if (q.trim()) params.set('q', q.trim());
      api.get<{ items: Ticket[]; counts: Partial<Record<Outcome, number>> }>(`/api/ops/tickets?${params}`)
        .then(d => { setItems(d.items); setCounts(d.counts); }).catch(() => {});
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [tab, q]);

  const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-paytm-blue">Tickets</h1>
        <p className="text-xs text-slate-500">Every support case: closed by Sahayak on its own, handled by a specialist, or still open</p>
      </div>

      <Card
        title={
          <div className="flex flex-wrap gap-1">
            {TABS.map(t => {
              const n = t === 'ALL' ? total : counts[t] || 0;
              return (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ${tab === t ? 'bg-paytm-blue font-semibold text-white' : 'font-medium text-slate-600 hover:bg-slate-100'}`}>
                  {t !== 'ALL' && <span className="h-2 w-2 rounded-full" style={{ background: OUTCOME_META[t].color }} />}
                  {t === 'ALL' ? 'All' : OUTCOME_META[t].label}
                  <span className={`tnum ${tab === t ? 'text-white/70' : 'text-slate-400'}`}>{n}</span>
                </button>
              );
            })}
          </div>
        }
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Case, customer, payment, biller…"
              className="w-56 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-paytm-cyan focus:bg-white" />
          </div>
        }
      >
        {items.length === 0 ? <Empty>No tickets match</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  {['Case', 'Customer · payment', 'Amount', 'Outcome', 'Human needed?', 'Checks', 'Time'].map(h => (
                    <th key={h} className={`px-4 py-2 font-semibold ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(t => (
                  <tr key={t.case_id} onClick={() => setOpen(t)} className="cursor-pointer hover:bg-slate-50/80">
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-bold text-slate-900">{t.case_id}</div>
                      <div className="text-[11px] text-slate-500">{t.issue_type.replaceAll('_', ' ').toLowerCase()}</div>
                      {t.complaint_ref && <span className="mt-0.5 inline-block font-mono text-[10px] font-semibold text-amber-700">complaint {t.complaint_ref}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{t.customer_name}</div>
                      <div className="text-[11px] text-slate-500">{t.payment ? `${t.payment.biller_name} · ${t.payment.id}` : 'no payment linked'}</div>
                    </td>
                    <td className="tnum px-4 py-2.5 text-right font-mono font-bold">{t.payment ? rupees(t.payment.amount_rs) : '–'}</td>
                    <td className="px-4 py-2.5"><Badge tone={OUTCOME_META[t.outcome].tone}>{OUTCOME_META[t.outcome].label}</Badge></td>
                    <td className="px-4 py-2.5">
                      {t.outcome === 'AUTO_RESOLVED' ? <span className="text-emerald-700">No</span>
                        : t.outcome === 'IN_PROGRESS' ? <span className="text-slate-400">Not yet</span>
                        : <span className="font-semibold text-rose-600">Yes{t.human_interventions > 1 ? ` (${t.human_interventions}×)` : ''}</span>}
                    </td>
                    <td className="tnum px-4 py-2.5 text-slate-600">
                      {t.pending_check ? `${t.pending_check.attempt}/${t.pending_check.max_attempts} · next ${t.pending_check.due_in_seconds}s` : t.checks_run || '–'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {t.minutes_to_resolve != null ? `closed in ${t.minutes_to_resolve} min` : `opened ${timeAgo(t.opened_at)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <TicketDrawer ticket={open} onClose={() => setOpen(null)} toast={toast} openSpecialist={openSpecialist} />}
    </div>
  );
}

function TicketDrawer({ ticket: t, onClose, toast, openSpecialist }: { ticket: Ticket; onClose: () => void; toast: (m: string) => void; openSpecialist: () => void }) {
  const [detail, setDetail] = useState<{ events: CaseEvent[]; evidence: { id: string; source: string; summary: string }[] } | null>(null);
  const [gateway, setGateway] = useState<GatewayTimeline | null>(null);
  useEffect(() => { api.get<typeof detail>(`/api/cases/${t.case_id}`).then(setDetail).catch(() => {}); }, [t.case_id]);
  useEffect(() => {
    if (t.payment) api.get<GatewayTimeline>(`/api/razorpay/payments/${t.payment.id}/timeline`).then(setGateway).catch(() => {});
  }, [t.payment?.id]);

  const runNow = async () => {
    if (!t.pending_check) return;
    try {
      await api.post(`/api/queue/${t.pending_check.id}/run-now`);
      toast(`${t.pending_check.id} will run on the next worker poll`);
    } catch (e) {
      toast(`${e}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="thin-scroll h-full w-full max-w-lg space-y-5 overflow-y-auto bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-sm font-bold text-paytm-blue">{t.case_id}</div>
            <div className="text-xs text-slate-500">{t.customer_name} ({t.customer_id}) · {t.issue_type.replaceAll('_', ' ').toLowerCase()}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone={OUTCOME_META[t.outcome].tone}>{OUTCOME_META[t.outcome].label}</Badge>
          <Badge>status {t.status.toLowerCase()}</Badge>
          {t.resolution_mode && <Badge>{t.resolution_mode.replaceAll('_', ' ').toLowerCase()}</Badge>}
        </div>

        {t.payment && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex justify-between font-semibold text-slate-800">
              <span>{t.payment.biller_name}</span><span className="tnum">{rupees(t.payment.amount_rs)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 font-mono text-[11px] text-slate-500">
              <span>{t.payment.id}</span>
              <span>bank {t.payment.provider_status.toLowerCase()}</span>
              <span>biller {t.payment.biller_posting_status.toLowerCase()}</span>
              <span>refund {t.payment.refund_status.toLowerCase()}</span>
            </div>
            <div className="mt-1.5"><Badge tone={paymentStatus(t.payment).tone}>{paymentStatus(t.payment).label}</Badge></div>
          </div>
        )}

        {t.summary && <p className="text-sm text-slate-600">{t.summary}</p>}

        <div className="flex gap-2">
          {t.pending_check && <Button variant="primary" onClick={runNow}>Run check {t.pending_check.attempt} now</Button>}
          {t.outcome === 'NEEDS_HUMAN' && <Button variant="primary" onClick={openSpecialist}>Reply in specialist inbox</Button>}
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Timeline</div>
          {!detail ? <div className="text-xs text-slate-400">Loading…</div> : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-4">
              {detail.events.map(e => (
                <li key={e.id} className="text-xs">
                  <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-paytm-cyan" />
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-800">{e.event_type.replaceAll('_', ' ').toLowerCase()}</span>
                    <span className="text-slate-400">{timeAgo(e.created_at)}</span>
                  </div>
                  <div className="text-slate-500">
                    {e.actor_type.replaceAll('_', ' ').toLowerCase()}
                    {e.to_status && e.to_status !== e.from_status ? ` → ${e.to_status.toLowerCase()}` : ''}
                    {e.details?.attempt ? ` · check ${e.details.attempt}/${e.details.max_attempts}` : ''}
                    {e.details?.reason ? ` · ${e.details.reason}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {gateway?.order && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Razorpay timeline</div>
            <div className="mb-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
              <Badge>{gateway.order.order_id}</Badge>
              {gateway.order.razorpay_payment_id && <Badge tone="blue">{gateway.order.razorpay_payment_id}</Badge>}
              <Badge tone={gateway.order.status === 'PAID' ? 'green' : gateway.order.status === 'FAILED' ? 'red' : 'amber'}>{gateway.order.status.toLowerCase()}</Badge>
              {gateway.order.refund_id && <Badge tone={gateway.order.refund_status === 'PROCESSED' ? 'green' : 'amber'}>refund {gateway.order.refund_id} · {gateway.order.refund_status?.toLowerCase()}</Badge>}
            </div>
            {gateway.order.error && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{gateway.order.error}</p>}
            <table className="w-full text-left text-[11px]">
              <tbody className="divide-y divide-slate-100">
                {gateway.events.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap py-1.5 pr-2 text-slate-400">{timeAgo(e.at)}</td>
                    <td className="py-1.5 pr-2 font-medium text-slate-700">{e.event.replace('RAZORPAY_', '').replaceAll('_', ' ').toLowerCase()}</td>
                    <td className="py-1.5 text-slate-500">
                      {e.from && e.to && e.from !== e.to ? `${e.from.toLowerCase()} → ${e.to.toLowerCase()} · ` : ''}
                      {[e.detail.method, e.detail.vpa, e.detail.rrn && `RRN ${e.detail.rrn}`, e.detail.error_description,
                        e.detail.refund_id, e.detail.razorpay_payment_id, e.detail.order_id].filter(Boolean).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {detail && detail.evidence.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Evidence the agent used</div>
            <ul className="space-y-1.5">
              {detail.evidence.map(ev => (
                <li key={ev.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-medium text-slate-700">{ev.source}</span> <span className="text-slate-500">· {ev.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
