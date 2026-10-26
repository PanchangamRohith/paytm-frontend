import { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { api, paymentStatus, type ChatMessage } from '../api';
import { Badge, rupees, timeAgo } from '../ui';
import Bubble from './Bubble';

type Thread = {
  payment: { id: string; biller_name: string; account_number: string; amount_rs: number; provider_status: string;
             biller_posting_status: string; refund_status: string; created_at: string };
  case: { id: string; status: string; issue_type: string; with_specialist: boolean } | null;
  pending_check: { id: string; attempt: number; max_attempts: number; due_in_seconds: number } | null;
  complaint: { ref: string; status: string } | null;
  conversation_id: string | null;
  messages: ChatMessage[];
};

const RAIL_TONE = (s: string) =>
  ['SUCCESS', 'POSTED', 'COMPLETED'].includes(s) ? 'green' : ['FAILED', 'REJECTED'].includes(s) ? 'red' : s === 'NOT_APPLICABLE' ? 'slate' : 'amber';

type Props = { customerId: string; paymentId: string; toast: (m: string) => void; onClose: () => void; onRead?: () => void };

// Everything about one payment: status, case, complaint, and every message about it (agent, specialist, updates)
export default function PaymentDrawer({ customerId, paymentId, toast, onClose, onRead }: Props) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      setThread(await api.get<Thread>(`/api/customers/${customerId}/payments/${paymentId}/thread`));
      // Opening the payment counts as reading its notifications
      const r = await api.post<{ marked: number }>(`/api/customers/${customerId}/notifications/read`, { payment_id: paymentId });
      if (r.marked) onRead?.();
    } catch (e) {
      toast(`Could not load payment: ${e}`);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [paymentId]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread?.messages.length]);

  const send = async (text = input) => {
    const content = text.trim();
    if (!content || sending) return;
    setInput('');
    setSending(true);
    try {
      await api.post('/api/chat/messages', {
        customer_id: customerId, conversation_id: thread?.conversation_id, payment_id: paymentId,
        content, client_message_id: `cli-${Date.now()}`,
      });
      await load();
    } catch (e) {
      toast(`Message failed: ${e}`);
    } finally {
      setSending(false);
    }
  };

  const p = thread?.payment;
  const msgs = thread?.messages ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-slate-100 p-5">
          {p ? (
            <div>
              <div className="text-base font-bold text-paytm-blue">{p.biller_name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">{p.id}</span><span>·</span><span>{p.account_number}</span><span>·</span><span>paid {timeAgo(p.created_at)}</span>
              </div>
            </div>
          ) : <div className="text-sm text-slate-400">Loading…</div>}
          <div className="flex items-start gap-3">
            {p && <span className="tnum text-lg font-extrabold text-slate-900">{rupees(p.amount_rs)}</span>}
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
        </header>

        {p && thread && (
          <div className="space-y-3 border-b border-slate-100 p-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone={paymentStatus(p).tone}>{paymentStatus(p).label}</Badge>
              {thread.case && <Badge tone={thread.case.with_specialist ? 'red' : 'blue'}>
                {thread.case.with_specialist ? 'With a payments specialist' : `Case ${thread.case.status.toLowerCase()}`} · {thread.case.id}
              </Badge>}
              {thread.complaint && <Badge tone="green">Complaint {thread.complaint.ref}</Badge>}
              {thread.pending_check && <Badge tone="amber">Check {thread.pending_check.attempt}/{thread.pending_check.max_attempts} in {thread.pending_check.due_in_seconds}s</Badge>}
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {[['Bank / gateway', p.provider_status], ['Biller posting', p.biller_posting_status], ['Refund', p.refund_status]].map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1.5 text-slate-500">{k}</td>
                    <td className="py-1.5 text-right"><Badge tone={RAIL_TONE(v)}>{v.toLowerCase().replaceAll('_', ' ')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div ref={feedRef} className="thin-scroll flex-1 space-y-4 overflow-y-auto bg-[#fcfdff] p-5 text-xs">
          {thread && msgs.length === 0 && (
            <div className="py-8 text-center text-slate-400">No messages about this payment yet. Ask Sahayak below.</div>
          )}
          {msgs.map((m, i) => (
            <Bubble key={m.id} m={m}
              onConsent={i === msgs.length - 1 && m.metadata?.consent?.status === 'PENDING'
                ? yes => send(yes ? 'Yes, please file the complaint' : 'No, do not file a complaint') : undefined} />
          ))}
          {sending && <div className="pl-9 text-[11px] italic text-slate-400">Sahayak is looking into it…</div>}
        </div>

        <div className="flex gap-2 border-t border-slate-200 p-3">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={thread?.case?.with_specialist ? 'Reply to the specialist…' : 'Ask about this payment…'}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-paytm-cyan focus:bg-white" />
          <button onClick={() => send()} disabled={sending || !input.trim()}
            className="flex items-center rounded-xl bg-paytm-blue px-3 text-white hover:bg-paytm-dark disabled:opacity-40">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
    </div>
  );
}
