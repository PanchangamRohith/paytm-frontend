import { useEffect, useRef, useState } from 'react';
import { api, paymentStatus, type EscalatedCase } from '../api';
import { Badge, Button, Card, Empty, renderMarkdown, rupees, timeAgo } from '../ui';

type Evidence = { id: string; source: string; summary: string };
type ConvMessage = { id: string; role: string; kind: string; content: string; created_at: string; about_this_case: boolean; channel?: string };

const STATUS_TONE = (s: string) =>
  ['SUCCESS', 'POSTED', 'COMPLETED'].includes(s) ? 'green' : ['FAILED', 'REJECTED'].includes(s) ? 'red'
    : ['NOT_APPLICABLE'].includes(s) ? 'slate' : 'amber';

export default function SpecialistTab({ toast, onCountChange }: { toast: (m: string) => void; onCountChange: (n: number) => void }) {
  const [cases, setCases] = useState<EscalatedCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [onlyThisCase, setOnlyThisCase] = useState(false);
  const [reply, setReply] = useState('');
  const [resolution, setResolution] = useState<'AUTO' | 'BILLER_POSTED' | 'REFUND_COMPLETED' | 'NONE'>('AUTO');
  const [refundAmount, setRefundAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const list = await api.get<EscalatedCase[]>('/api/cases/escalated');
      setCases(list);
      onCountChange(list.length);
      setSelectedId(id => (id && list.some(c => c.id === id) ? id : list[0]?.id ?? null));
    } catch {}
  };

  const loadConversation = (id: string) =>
    api.get<{ messages: ConvMessage[] }>(`/api/cases/${id}/conversation`).then(d => setMessages(d.messages)).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setEvidence(null);
    setMessages([]);
    setReply('');
    if (!selectedId) return;
    api.get<{ evidence: Evidence[] }>(`/api/cases/${selectedId}`).then(d => setEvidence(d.evidence)).catch(() => {});
    loadConversation(selectedId);
    const t = setInterval(() => loadConversation(selectedId), 5000);
    return () => clearInterval(t);
  }, [selectedId]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages.length, onlyThisCase]);

  const selected = cases.find(c => c.id === selectedId);
  const shown = messages.filter(m => !onlyThisCase || m.about_this_case);

  const send = async (resolve: boolean) => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ payment_outcome: string | null }>(`/api/cases/${selected.id}/specialist-reply`,
        { content: reply.trim(), resolve, payment_resolution: resolution, refund_amount_rs: refundAmount ? Number(refundAmount) : null });
      toast(resolve
        ? `${selected.id} resolved${r.payment_outcome ? ` · payment: ${r.payment_outcome}` : ''}; Sahayak is confirming with ${selected.customer_name}`
        : `Reply sent to ${selected.customer_name}`);
      setResolution('AUTO');
      setRefundAmount('');
      setReply('');
      await loadConversation(selected.id);
      await load();
    } catch (e) {
      toast(`Reply failed: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <Card title={`Escalated (${cases.length})`} className="lg:col-span-4">
        {cases.length === 0 ? (
          <Empty>No escalations. Cases land here when the agent hands off.</Empty>
        ) : (
          <ul className="thin-scroll max-h-[calc(100vh-200px)] divide-y divide-slate-100 overflow-y-auto">
            {cases.map(c => (
              <li key={c.id}>
                <button onClick={() => setSelectedId(c.id)}
                  className={`w-full border-l-2 px-4 py-3 text-left hover:bg-slate-50 ${c.id === selectedId ? 'border-paytm-cyan bg-sky-50/70' : 'border-transparent'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-700">{c.id}</span>
                    <span className="text-[11px] text-slate-400">{timeAgo(c.escalated_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-800">
                    {c.customer_name}
                    <Badge tone={c.claimed_by ? 'blue' : 'amber'}>{c.claimed_by ? 'picked up' : 'unassigned'}</Badge>
                    {c.brief.complaint && <Badge tone="amber">complaint {c.brief.complaint.ref}</Badge>}
                  </div>
                  <div className="truncate text-[11px] text-slate-400">
                    {c.payment ? `${c.payment.biller_name} ${rupees(c.payment.amount_rs)} · ` : ''}{c.reason || c.issue_type}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-5 lg:col-span-8">
        {!selected ? (
          <Card><Empty>Select a case</Empty></Card>
        ) : (
          <>
            {/* Structured brief */}
            <Card title={<span>{selected.id} <span className="font-normal text-slate-400">· {selected.customer_name} ({selected.customer_id})</span></span>}
              actions={<>
                {selected.priority && <Badge tone="red">{selected.priority.toLowerCase()} priority</Badge>}
                {selected.claimed_by
                  ? <Badge tone="blue">Picked up by {selected.claimed_by}</Badge>
                  : <Button variant="primary" onClick={async () => {
                      await api.post(`/api/cases/${selected.id}/claim`, { staff_id: 'STAFF-01' }).catch(() => {});
                      toast(`${selected.id} picked up; ${selected.customer_name} has been told you're on it`);
                      load();
                    }}>Pick up case</Button>}
              </>}>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Why it was handed off">{selected.reason || '–'}</Field>
                  <Field label="Issue">{selected.issue_type.replaceAll('_', ' ').toLowerCase()}</Field>
                </div>

                {selected.brief.customer_request && (
                  <Field label={`Customer's latest message · ${timeAgo(selected.brief.customer_request_at!)}`}>
                    <blockquote className="rounded-lg border-l-4 border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-slate-800">
                      “{selected.brief.customer_request}”
                    </blockquote>
                  </Field>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Payment">
                    {selected.payment ? (
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-100">
                          <Row k="Biller" v={selected.payment.biller_name} />
                          <Row k="Amount" v={<span className="tnum font-semibold">{rupees(selected.payment.amount_rs)}</span>} />
                          <Row k="Payment ID" v={<span className="font-mono">{selected.payment.id}</span>} />
                          <Row k="Paid" v={selected.brief.paid_at ? timeAgo(selected.brief.paid_at) : '–'} />
                          <Row k="Customer sees" v={<Badge tone={paymentStatus(selected.payment).tone}>{paymentStatus(selected.payment).label}</Badge>} />
                        </tbody>
                      </table>
                    ) : <span className="text-xs text-slate-400">No payment linked</span>}
                  </Field>
                  <Field label="Rail status">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100">
                        {selected.brief.payment_status.map(r => (
                          <Row key={r.rail} k={r.rail} v={<Badge tone={STATUS_TONE(r.status)}>{r.status.toLowerCase().replaceAll('_', ' ')}</Badge>} />
                        ))}
                        <Row k="Automatic re-checks" v={`${selected.brief.checks.run} run · ${selected.brief.checks.cancelled} stopped at handoff`} />
                        {selected.brief.consent && (
                          <Row k="Customer consent" v={<Badge tone={selected.brief.consent.status === 'GRANTED' ? 'green' : selected.brief.consent.status === 'PENDING' ? 'amber' : 'slate'}>
                            {selected.brief.consent.status.toLowerCase()}</Badge>} />
                        )}
                        {selected.brief.complaint && (
                          <Row k="Partner complaint" v={<span className="font-mono font-semibold">{selected.brief.complaint.ref} · SLA {selected.brief.complaint.sla_hours}h</span>} />
                        )}
                      </tbody>
                    </table>
                  </Field>
                </div>
              </div>
            </Card>

            {/* Conversation + reply */}
            <Card title="Conversation & reply"
              actions={
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={onlyThisCase} onChange={e => setOnlyThisCase(e.target.checked)} className="accent-paytm-blue" />
                  Only this payment
                </label>
              }>
              <div ref={feedRef} className="thin-scroll max-h-[380px] space-y-3 overflow-y-auto bg-slate-50/70 px-5 py-4">
                {shown.length === 0 && <div className="py-6 text-center text-xs text-slate-400">No messages</div>}
                {shown.map(m => <Transcript key={m.id} m={m} />)}
              </div>
              <div className="space-y-2 border-t border-slate-100 p-4">
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3}
                  placeholder={`Reply to ${selected.customer_name}. It appears in their Sahayak chat.`}
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-paytm-cyan" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500" title="Applied to the payment when you click Send & resolve">
                    On resolve, mark payment as
                    <select value={resolution} onChange={e => setResolution(e.target.value as typeof resolution)}
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-800 outline-none focus:border-paytm-cyan">
                      <option value="AUTO">Auto: {autoOutcome(selected)}</option>
                      <option value="BILLER_POSTED">Biller confirmed (paid)</option>
                      <option value="REFUND_COMPLETED">Refund credited</option>
                      <option value="NONE">Leave payment as is</option>
                    </select>
                  </label>
                  {selected.payment?.razorpay && (resolution === 'REFUND_COMPLETED' || (resolution === 'AUTO' && autoOutcome(selected).startsWith('refund'))) && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500" title="Real Razorpay refund; leave blank for the full refundable amount">
                      Refund ₹
                      <input type="number" min={1} max={selected.payment.amount_rs} value={refundAmount}
                        onChange={e => setRefundAmount(e.target.value)} placeholder={`${selected.payment.amount_rs} (full)`}
                        className="w-24 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] outline-none focus:border-paytm-cyan" />
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={() => send(false)} disabled={busy || !reply.trim()}>Send</Button>
                    <Button variant="primary" onClick={() => send(true)} disabled={busy || !reply.trim()}>Send & resolve</Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* What the agent did */}
            <Card title="What the agent did">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                    {['When', 'Step', 'By', 'Result'].map(h => <th key={h} className="px-5 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selected.brief.agent_actions.map((a, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-5 py-2 text-slate-500">{timeAgo(a.at)}</td>
                      <td className="px-5 py-2 font-medium text-slate-800">{a.step}</td>
                      <td className="px-5 py-2 text-slate-600">{a.by}</td>
                      <td className="px-5 py-2 text-slate-600">{a.result || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Evidence the agent used">
              {!evidence ? <Empty>Loading…</Empty> : evidence.length === 0 ? <Empty>No evidence gathered</Empty> : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-2 font-semibold">Source</th><th className="px-5 py-2 font-semibold">Finding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {evidence.map(ev => (
                      <tr key={ev.id}>
                        <td className="whitespace-nowrap px-5 py-2 font-medium text-slate-700">{ev.source.replaceAll('_', ' ').toLowerCase()}</td>
                        <td className="px-5 py-2 text-slate-600">{ev.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function autoOutcome(c: EscalatedCase) {
  if (!c.payment) return 'no payment linked';
  return c.payment.provider_status === 'FAILED' || ['DOUBLE_DEBIT', 'DEBIT_WITHOUT_CREDIT'].includes(c.issue_type)
    ? 'refund credited' : 'biller confirmed (paid)';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr>
      <td className="py-1.5 pr-3 text-slate-500">{k}</td>
      <td className="py-1.5 text-right text-slate-800">{v}</td>
    </tr>
  );
}

function Transcript({ m }: { m: ConvMessage }) {
  if (m.role === 'SYSTEM') {
    return (
      <div className="flex justify-center">
        <span className="rounded-lg bg-amber-50 px-3 py-1 text-center text-[11px] text-amber-900 ring-1 ring-amber-200">
          ⚡ {m.content.replace('[System event] ', '').split(' needs attention')[0]} · {timeAgo(m.created_at)}
        </span>
      </div>
    );
  }
  const who = m.role === 'CUSTOMER' ? 'Customer' : m.role === 'HUMAN_SPECIALIST' ? 'Specialist' : m.kind === 'STATUS_CARD' ? 'Sahayak · automatic update' : 'Sahayak';
  const mine = m.role === 'HUMAN_SPECIALIST';
  return (
    <div className={`flex ${m.role === 'CUSTOMER' ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[82%] ${m.about_this_case ? '' : 'opacity-60'}`}>
        <div className={`mb-0.5 text-[10px] ${m.role === 'CUSTOMER' ? '' : 'text-right'} text-slate-400`}>
          {who} · {timeAgo(m.created_at)}{m.channel === 'WHATSAPP' ? ' · via WhatsApp' : ''}{m.about_this_case ? ' · this payment' : ''}
        </div>
        <div className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
          m.role === 'CUSTOMER' ? 'rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200'
            : mine ? 'rounded-tr-sm bg-amber-100 text-amber-950' : 'rounded-tr-sm bg-paytm-blue text-white'}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
      </div>
    </div>
  );
}
