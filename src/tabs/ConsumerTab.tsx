import { useEffect, useRef, useState, type ComponentType } from 'react';
import PaymentDrawer from './PaymentDrawer';
import Bubble from './Bubble';
import {
  Bell, Bot, BadgeCheck, CheckCircle2, CreditCard, Droplets, Flame, Hourglass, Landmark, MessageSquare, Plus,
  RefreshCw, Router, RotateCcw, Send, ShieldCheck, Smartphone, Sparkles, Train, Tv, Zap, Building2, HeartPulse, Car, X,
} from 'lucide-react';
import { api, paymentStatus, type ChatMessage, type QueueItem, type Scenario, type SupportCase, type Transaction } from '../api';
import { rupees, timeAgo } from '../ui';

type Icon = ComponentType<{ className?: string }>;

const SERVICES: Array<{ name: string; sub: string; icon: Icon; tint: string; biller: string; billerId: string; amount: number }> = [
  { name: 'Mobile Recharge', sub: 'Jio, Airtel, Vi, BSNL', icon: Smartphone, tint: 'bg-sky-50 text-paytm-cyan', biller: 'Jio Mobile Recharge', billerId: 'JIO-PREPAID', amount: 749 },
  { name: 'Electricity Bill', sub: 'BESCOM, MSEB, Tata', icon: Zap, tint: 'bg-amber-50 text-amber-600', biller: 'BESCOM Electricity', billerId: 'BESCOM-BLR', amount: 2340 },
  { name: 'DTH', sub: 'Tata Play, Sun, Dish', icon: Tv, tint: 'bg-indigo-50 text-indigo-600', biller: 'Tata Play DTH', billerId: 'TATAPLAY-DTH', amount: 450 },
  { name: 'FASTag', sub: 'All bank tags', icon: Car, tint: 'bg-emerald-50 text-emerald-600', biller: 'NHAI FASTag', billerId: 'NHAI-FASTAG', amount: 500 },
  { name: 'Piped Gas', sub: 'IGL, MGL, Adani', icon: Flame, tint: 'bg-orange-50 text-orange-600', biller: 'Mahanagar Gas', billerId: 'MGL-MUM', amount: 820 },
  { name: 'Water', sub: 'BWSSB, Delhi Jal', icon: Droplets, tint: 'bg-cyan-50 text-cyan-600', biller: 'BWSSB Water Supply', billerId: 'BWSSB-WATER', amount: 650 },
  { name: 'Broadband', sub: 'Airtel, Jio, ACT', icon: Router, tint: 'bg-blue-50 text-blue-600', biller: 'ACT Fibernet Broadband', billerId: 'ACT-FIBER', amount: 1180 },
  { name: 'Credit Card', sub: 'Visa, Master, RuPay', icon: CreditCard, tint: 'bg-violet-50 text-violet-600', biller: 'HDFC Credit Card', billerId: 'HDFC-CC', amount: 5400 },
  { name: 'Metro Card', sub: 'DMRC, BMRCL', icon: Train, tint: 'bg-teal-50 text-teal-600', biller: 'DMRC Metro Card', billerId: 'DMRC-NCMC', amount: 300 },
  { name: 'Loan EMI', sub: 'Bajaj, HDFC', icon: Landmark, tint: 'bg-slate-100 text-slate-700', biller: 'Bajaj Finance EMI', billerId: 'BAJAJ-EMI', amount: 3200 },
  { name: 'Municipal Tax', sub: 'Property & civic', icon: Building2, tint: 'bg-rose-50 text-rose-600', biller: 'BBMP Property Tax', billerId: 'BBMP-TAX', amount: 4100 },
  { name: 'Insurance', sub: 'LIC, Max, Star', icon: HeartPulse, tint: 'bg-teal-50 text-teal-700', biller: 'LIC Insurance Premium', billerId: 'LIC-PREMIUM', amount: 5000 },
];

// First match wins, so broadband is checked before generic telecom names
const ICON_RULES: Array<[RegExp, string]> = [
  [/broadband|fiber|fibernet/i, 'Broadband'], [/electric|power|bescom|bses/i, 'Electricity Bill'],
  [/dth|tata play/i, 'DTH'], [/fastag/i, 'FASTag'], [/gas/i, 'Piped Gas'], [/water|bwssb/i, 'Water'],
  [/credit card/i, 'Credit Card'], [/metro/i, 'Metro Card'], [/emi|loan/i, 'Loan EMI'], [/tax/i, 'Municipal Tax'],
  [/insurance|lic/i, 'Insurance'], [/mobile|recharge|postpaid|jio|airtel|vi /i, 'Mobile Recharge'],
];
const iconFor = (biller: string) =>
  SERVICES.find(s => s.name === ICON_RULES.find(([re]) => re.test(biller))?.[1]) ?? SERVICES[0];

const QUICK_PROMPTS = [
  'Which of my payments are pending?',
  'My latest bill payment was debited but still shows unpaid.',
  'Is any refund due to me?',
  'What is the status of my open cases?',
  'I want to talk to a human specialist',
];

type Filter = 'ALL' | 'ATTENTION' | 'SETTLED';
type Props = {
  customerId: string; customerName: string; toast: (m: string) => void;
  focusPayment?: { id: string; n: number } | null; unread?: Record<string, number>; onRead?: () => void;
};

export default function ConsumerTab({ customerId, customerName, toast, focusPayment, unread = {}, onRead }: Props) {
  const [openPayment, setOpenPayment] = useState<string | null>(null);
  useEffect(() => { if (focusPayment) setOpenPayment(focusPayment.id); }, [focusPayment]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [checks, setChecks] = useState<QueueItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState<(typeof SERVICES)[number] | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const firstName = customerName.split(' ')[0];

  // Follows the customer's latest conversation, so curl turns and worker updates appear live
  const load = async () => {
    try {
      const [txns, cs, q, convs] = await Promise.all([
        api.get<Transaction[]>(`/api/transactions?customer_id=${customerId}`),
        api.get<SupportCase[]>(`/api/cases?customer_id=${customerId}`),
        api.get<{ items: QueueItem[] }>(`/api/queue?customer_id=${customerId}&status=PENDING`),
        api.get<{ id: string }[]>(`/api/chat/conversations?customer_id=${customerId}`),
      ]);
      setTransactions(txns);
      setCases(cs);
      setChecks(q.items);
      const conv = convs[0]?.id ?? null;
      setConversationId(conv);
      setMessages(conv ? await api.get<ChatMessage[]>(`/api/chat/conversations/${conv}/messages`) : []);
    } catch (e) {
      toast(`Backend unreachable: ${e}`);
    }
  };

  useEffect(() => {
    setMessages([]);
    load();
  }, [customerId]);

  useEffect(() => {
    if (sending) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [customerId, sending]);

  useEffect(() => {
    if (messages.length !== lastCount.current && feedRef.current) {
      feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
    }
    lastCount.current = messages.length;
  }, [messages]);

  const send = async (text = input) => {
    const content = text.trim();
    if (!content || sending) return;
    setInput('');
    setSending(true);
    setMessages(m => [...m, { id: `local-${Date.now()}`, role: 'CUSTOMER', content, created_at: new Date().toISOString() }]);
    try {
      await api.post('/api/chat/messages', {
        customer_id: customerId, conversation_id: conversationId, content, client_message_id: `cli-${Date.now()}`,
      });
    } catch (e) {
      toast(`Message failed: ${e}`);
    } finally {
      setSending(false);
      load();
    }
  };

  const newChat = async () => {
    try {
      const conv = await api.post<{ id: string }>('/api/chat/conversations', { customer_id: customerId });
      setConversationId(conv.id);
      setMessages([]);
    } catch (e) {
      toast(`Could not start a new chat: ${e}`);
    }
  };

  const pay = async (opts: PayOptions) => {
    if (!paying) return;
    if (opts.method === 'RAZORPAY') return payWithRazorpay(opts);
    try {
      const r = await api.post<{ payment_id: string; duplicate: boolean; settle_in_seconds: number }>('/api/payments/initiate', {
        customer_id: customerId, biller_id: paying.billerId, biller_name: paying.biller, ...opts,
      });
      toast(r.duplicate
        ? `Already submitted: ${r.payment_id} (same idempotency key, not charged twice)`
        : `${paying.biller}: ₹${opts.amount_rs} submitted (${r.payment_id}). Waiting for the bank, ~${r.settle_in_seconds}s.`);
      setPaying(null);
      load();
    } catch (e) {
      toast(`Payment failed: ${e}`);
    }
  };

  // Real (test-mode) Razorpay Checkout: server creates the order, Checkout collects payment, server verifies & confirms
  const payWithRazorpay = async (opts: PayOptions) => {
    if (!paying) return;
    try {
      const order = await api.post<RzpOrder>('/api/razorpay/orders', {
        customer_id: customerId, biller_id: paying.billerId, biller_name: paying.biller, amount_rs: opts.amount_rs,
        idempotency_key: opts.idempotency_key, biller_outcome: opts.biller_outcome, resolves_on_attempt: opts.resolves_on_attempt,
      });
      const biller = paying.biller;
      setPaying(null);
      load();
      await openCheckout(order, biller);
    } catch (e) {
      toast(`Razorpay: ${e}`);
    }
  };

  // Opens Razorpay Checkout for an order (new payment or "Complete payment" on an unfinished one)
  const openCheckout = async (order: RzpOrder, biller: string) => {
    if (!(await loadCheckout())) return toast('Razorpay: could not load Checkout');
    const sync = () => api.post(`/api/razorpay/orders/${order.order_id}/sync`).catch(() => {}).finally(load);
    const rzp = new (window as any).Razorpay({
      key: order.key_id, order_id: order.order_id, amount: order.amount_paise, currency: order.currency,
      name: 'Paytm Sahayak (test)', description: `${biller} · ${order.payment_id}`,
      prefill: order.prefill, notes: { payment_id: order.payment_id }, theme: { color: '#002970' },
      handler: async (resp: Record<string, string>) => {
        try {
          const r = await api.post<{ status: string }>('/api/razorpay/verify', resp);
          toast(`Razorpay: ${order.payment_id} ${r.status === 'PAID' ? 'paid' : r.status.toLowerCase()}`);
        } catch (e) {
          toast(`Verification failed: ${e}`);
        }
        load();
      },
      modal: {
        // Closed without paying -> server checks Razorpay; no attempt means "Not completed", nothing charged
        ondismiss: () => api.post<{ status: string }>(`/api/razorpay/orders/${order.order_id}/dismissed`)
          .then(r => r.status === 'ABANDONED' && toast(`${order.payment_id}: payment not completed, no money taken`))
          .catch(() => {}).finally(load),
      },
    });
    rzp.on('payment.failed', () => { toast(`Razorpay reported a failed attempt for ${order.payment_id}`); sync(); });
    rzp.open();
  };

  const resumePayment = async (t: Transaction) => {
    try {
      await openCheckout(await api.post<RzpOrder>(`/api/razorpay/payments/${t.id}/resume`), t.biller_name);
    } catch (e) {
      toast(`Razorpay: ${e}`);
    }
  };

  const checkFor = (paymentId: string) => checks.find(c => c.payment_id === paymentId);
  const caseFor = (paymentId: string) => cases.find(c => c.payment_id === paymentId && !['RESOLVED', 'CLOSED'].includes(c.status));
  const needsAttention = (t: Transaction) => paymentStatus(t).tone !== 'green';
  const visible = transactions.filter(t => filter === 'ALL' || (filter === 'ATTENTION' ? needsAttention(t) : !needsAttention(t)));
  const attentionCount = transactions.filter(needsAttention).length;
  const openCases = cases.filter(c => !['RESOLVED', 'CLOSED'].includes(c.status));
  const escalated = openCases.filter(c => c.status === 'ESCALATED').length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="mesh-gradient relative overflow-hidden rounded-2xl border border-slate-200/80 p-6 shadow-[0_4px_24px_rgba(0,41,112,0.04)] lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-paytm-cyan/10 blur-3xl" />
        <div className="relative grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          <div className="space-y-3.5 lg:col-span-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-paytm-blue px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              <ShieldCheck className="h-3.5 w-3.5 text-paytm-cyan" /> Sahayak payment protection
            </span>
            <h1 className="text-2xl font-extrabold leading-[1.18] tracking-tight text-paytm-blue sm:text-3xl lg:text-4xl">
              Pay bills instantly.<br />
              <span className="bg-gradient-to-r from-paytm-cyan to-paytm-teal bg-clip-text text-transparent">Sahayak watches every rupee.</span>
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
              If a payment fails or a biller doesn't confirm it, Sahayak's agents investigate, keep re-checking with the bank or biller,
              update you in chat, and hand off to a specialist if it can't be resolved automatically.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-paytm-cyan text-white"><Bot className="h-4 w-4" /></div>
                <div>
                  <span className="block text-xs font-bold leading-none text-paytm-blue">Sahayak for {firstName}</span>
                  <span className="text-[10px] font-semibold text-emerald-600">Manager · Investigator · Communicator · Worker</span>
                </div>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <FleetRow dot={checks.length ? 'bg-paytm-cyan' : 'bg-slate-300'} title="Verification worker"
                sub={checks.length ? `${checks.length} re-check${checks.length > 1 ? 's' : ''} queued` : 'Nothing to re-check'}
                pill={checks.length ? 'Watching' : 'Idle'} pillTone={checks.length ? 'text-paytm-teal bg-sky-100/70' : 'text-slate-500 bg-slate-100'} />
              <FleetRow dot={openCases.length ? 'bg-amber-500' : 'bg-emerald-500'} title="Open cases"
                sub={openCases.length ? `${openCases.length} open${escalated ? ` · ${escalated} with a specialist` : ''}` : 'All clear'}
                pill={`${openCases.length}`} pillTone="text-paytm-blue bg-slate-100" />
            </div>
            <button onClick={() => document.getElementById('sahayak-dock')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-paytm-blue px-3 py-2 text-xs font-semibold text-white hover:bg-paytm-dark">
              <MessageSquare className="h-4 w-4 text-paytm-cyan" /> Open Sahayak chat
            </button>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-6 w-1.5 rounded-full bg-paytm-cyan" />
          <div>
            <h2 className="text-lg font-bold tracking-tight text-paytm-blue">Recharge & bill payments</h2>
            <p className="text-xs font-medium text-slate-500">Pick a category to make a payment as {customerName}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {SERVICES.map(s => (
            <button key={s.name} onClick={() => setPaying(s)}
              className="group flex min-h-[120px] flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition-all hover:border-paytm-cyan hover:shadow-md">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tint}`}><s.icon className="h-6 w-6" /></div>
              <div>
                <span className="block text-xs font-bold leading-snug text-slate-900 group-hover:text-paytm-blue">{s.name}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{s.sub}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Payments + Sahayak dock */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:col-span-7">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-bold text-paytm-blue">Recent payments & protection</h3>
              <p className="text-xs text-slate-500">Live from the payments ledger</p>
            </div>
            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-[11px] font-semibold text-slate-600">
              {([['ALL', 'All'], ['ATTENTION', 'Needs attention'], ['SETTLED', 'Settled']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 ${filter === id ? 'bg-white font-bold text-paytm-blue shadow-xs' : 'hover:text-slate-900'}`}>
                  {label}
                  {id === 'ATTENTION' && attentionCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">{attentionCount}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 && <div className="py-10 text-center text-sm text-slate-400">No payments here</div>}

          <div className="thin-scroll max-h-[640px] space-y-3 overflow-y-auto pr-1">
            {visible.map(t => (
              <PaymentCard key={t.id} t={t} check={checkFor(t.id)} openCase={caseFor(t.id)} unread={unread[t.id] || 0}
                onOpen={() => setOpenPayment(t.id)}
                onResume={/^(order|pay)_/.test(t.provider_tx_id || '') && ['ABANDONED', 'FAILED', 'PENDING', 'RELEASED'].includes(t.provider_status)
                  ? () => resumePayment(t) : undefined}
                onAsk={() => send(`What is happening with my ${t.biller_name} payment ${t.id}?`)} />
            ))}
          </div>
        </section>

        <section id="sahayak-dock" className="sticky top-24 flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl lg:col-span-5">
          <div className="flex items-center justify-between border-b border-white/10 bg-paytm-dark p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-paytm-blue to-paytm-cyan shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-paytm-dark" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold tracking-tight">Sahayak AI</h4>
                <p className="text-[11px] text-slate-300">{customerName} · {conversationId || 'new conversation'}</p>
              </div>
            </div>
            <button onClick={newChat} title="New conversation" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div ref={feedRef} className="thin-scroll h-[460px] space-y-4 overflow-y-auto bg-[#fcfdff] p-4 text-xs">
            {messages.length === 0 && (
              <Bubble m={{ id: 'welcome', role: 'AI_TEAMMATE', created_at: new Date().toISOString(),
                content: `Namaste ${firstName}! I'm **Sahayak**. Ask me about pending bills, failed payments, refunds or double debits. I'll also message you here if I spot a problem.` }} />
            )}
            {messages.map((m, i) => (
              <Bubble key={m.id} m={m}
                onConsent={i === messages.length - 1 && m.metadata?.consent?.status === 'PENDING'
                  ? yes => send(yes ? 'Yes, please file the complaint' : 'No, do not file a complaint') : undefined} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 pl-9 text-[11px] italic text-slate-400">
                <RefreshCw className="h-3 w-3 animate-spin" /> Sahayak is investigating…
              </div>
            )}
          </div>

          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-2">
            {QUICK_PROMPTS.map(p => (
              <button key={p} onClick={() => send(p)} disabled={sending}
                className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition-colors hover:bg-paytm-cyan hover:text-paytm-blue disabled:opacity-40">
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-3">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={`Message Sahayak as ${firstName}…`}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-paytm-cyan focus:bg-white focus:ring-2 focus:ring-paytm-cyan/20" />
            <button onClick={() => send()} disabled={sending || !input.trim()}
              className="flex items-center gap-1 rounded-xl bg-paytm-blue px-3 text-xs font-semibold text-white hover:bg-paytm-dark disabled:opacity-40">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>

      {openPayment && (
        <PaymentDrawer customerId={customerId} paymentId={openPayment} toast={toast}
          onClose={() => { setOpenPayment(null); load(); }} onRead={onRead} />
      )}
      {paying && <PayDialog service={paying} customerName={customerName} onPay={pay} onClose={() => setPaying(null)} />}
    </div>
  );
}

function FleetRow({ dot, title, sub, pill, pillTone }: { dot: string; title: string; sub: string; pill: string; pillTone: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <div>
          <p className="text-[11px] font-semibold text-slate-800">{title}</p>
          <p className="text-[10px] text-slate-500">{sub}</p>
        </div>
      </div>
      <span className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${pillTone}`}>{pill}</span>
    </div>
  );
}

function PaymentCard({ t, check, openCase, unread, onOpen, onAsk, onResume }: {
  t: Transaction; check?: QueueItem; openCase?: SupportCase; unread: number; onOpen: () => void; onAsk: () => void; onResume?: () => void;
}) {
  const s = paymentStatus(t);
  const svc = iconFor(t.biller_name);
  const attention = s.tone !== 'green';
  const escalated = openCase?.status === 'ESCALATED';
  const pillTone = s.tone === 'red' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : s.tone === 'amber' ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <div onClick={onOpen} role="button" title="Open payment details"
      className={`cursor-pointer space-y-3 rounded-2xl border p-4 shadow-2xs transition-all hover:shadow-md ${
      escalated ? 'border-rose-200 bg-gradient-to-b from-rose-50/60 to-white'
        : attention ? 'border-amber-200/90 bg-gradient-to-b from-amber-50/60 to-white'
        : 'border-slate-200/80 bg-white hover:border-slate-300'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${svc.tint}`}><svc.icon className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{t.biller_name}</span>
              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${pillTone}`}>
                {attention ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : <CheckCircle2 className="h-3 w-3" />}
                {s.label}
              </span>
              {check && <span className="rounded-md bg-sky-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-paytm-teal">AI re-check active</span>}
              {unread > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  <Bell className="h-3 w-3" /> {unread} new
                </span>
              )}
            </div>
            <div className="tnum mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="font-mono">{t.id}</span><span>•</span><span>{t.account_number}</span><span>•</span><span>{timeAgo(t.created_at)}</span>
            </div>
          </div>
        </div>
        <span className="tnum shrink-0 text-base font-extrabold text-slate-900">{rupees(t.amount_rs)}</span>
      </div>

      {t.duplicate_of && t.refund_status !== 'COMPLETED' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900">
          <b>Looks like you paid this bill twice.</b> Same biller and amount as {t.duplicate_of}. Sahayak has flagged it for a
          payments specialist to refund the extra payment.
        </div>
      )}
      {t.refunded_rs != null && t.refund_status !== 'NOT_APPLICABLE' && (
        <div className="text-[11px] font-medium text-slate-600">
          Refunded <b className="tnum">{rupees(t.refunded_rs)}</b> of {rupees(t.amount_rs)}
          {t.refund_status === 'PARTIAL' ? ` · ${rupees(t.amount_rs - t.refunded_rs)} kept` : ''}
        </div>
      )}
      {t.provider_status === 'AUTHORIZED' && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs">
          <Hourglass className="h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <div className="font-bold text-slate-900">Money held by your bank, not taken yet</div>
            <div className="text-[11px] text-slate-600">It will either be captured (bill paid) or released back to you automatically. Don't pay again.</div>
          </div>
        </div>
      )}
      {t.processing && t.provider_status !== 'AUTHORIZED' && (
        <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs">
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-paytm-teal" />
          <div className="flex-1">
            <div className="font-bold text-slate-900">{t.processing.gateway ? 'Waiting for Razorpay to confirm' : 'Waiting for your bank to confirm'}</div>
            <div className="text-[11px] text-slate-600">
              {t.processing.gateway
                ? 'Complete or close the Razorpay window; Sahayak confirms the result with Razorpay directly. Don\'t pay again.'
                : `Checked ${t.processing.polls} time${t.processing.polls === 1 ? '' : 's'} so far · answer expected in ~${fmtDuration(t.processing.answer_in_seconds)}. Don't pay again.`}
            </div>
          </div>
        </div>
      )}

      {(check || openCase) && (
        <div className={`flex items-start gap-3 rounded-xl border bg-white/90 p-3 text-xs ${escalated ? 'border-rose-200' : 'border-amber-200'}`}>
          <div className={`mt-0.5 shrink-0 rounded-lg p-1 ${escalated ? 'bg-rose-500/10 text-rose-700' : 'bg-amber-500/10 text-amber-700'}`}>
            {escalated ? <BadgeCheck className="h-4 w-4" /> : <Hourglass className="h-4 w-4" />}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900">
                {escalated ? 'With a payments specialist' : check ? `Sahayak ${check.verification_type === 'REVERSAL_STATUS_CHECK' ? 'refund' : 'biller'} check ${check.attempt_number} of ${check.max_attempts}` : 'Sahayak is on it'}
              </span>
              {check && (
                <span className="tnum rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-700">
                  {check.seconds_until_due ? `next check in ${fmtDuration(check.seconds_until_due)}` : 'checking now'}
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600">
              {escalated
                ? `Automatic checks couldn't confirm this payment, so ${openCase!.id} was handed to a specialist who will reply in chat.`
                : check
                  ? `Case ${check.case_id}. ${check.next_retry_delay_seconds != null ? `If not confirmed, Sahayak retries ${fmtDuration(check.next_retry_delay_seconds)} later` : 'If this check fails, Sahayak hands it to a specialist'}. You'll get an update in chat either way. Don't pay again.`
                  : `Case ${openCase!.id} is ${openCase!.status.toLowerCase()}.`}
            </p>
          </div>
        </div>
      )}

      {attention && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <span className="text-[11px] font-medium text-paytm-teal">View details & messages →</span>
          <div className="flex gap-2">
          {onResume && (
            <button onClick={e => { e.stopPropagation(); onResume(); }}
              className="rounded-xl border border-paytm-blue px-3.5 py-1.5 text-xs font-bold text-paytm-blue hover:bg-sky-50">
              {t.provider_status === 'FAILED' ? 'Retry payment' : 'Complete payment'}
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onAsk(); }}
            className="flex items-center gap-1.5 rounded-xl bg-paytm-blue px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-paytm-dark">
            <Sparkles className="h-3.5 w-3.5 text-paytm-cyan" /> Ask Sahayak
          </button>
          </div>
        </div>
      )}
    </div>
  );
}

type PayOptions = {
  method: 'RAZORPAY' | 'SIMULATED'; amount_rs: number; idempotency_key: string; scenario: string; processing_seconds: number;
  resolves_on_attempt: number | null; biller_outcome: 'POSTED' | 'DELAYED';
};

type RzpOrder = {
  order_id: string; key_id: string; amount_paise: number; currency: string; payment_id: string;
  prefill: { name: string; email: string; contact: string };
};

const loadCheckout = () => new Promise<boolean>(resolve => {
  if ((window as any).Razorpay) return resolve(true);
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

const RECHECK_SCENARIOS = ['BILLER_POSTING_DELAY', 'PROVIDER_UNKNOWN', 'FAILED_REFUND_PENDING'];
const PROCESSING = [{ s: 10, label: '10 seconds' }, { s: 30, label: '30 seconds' }, { s: 60, label: '1 minute' }, { s: 120, label: '2 minutes' }];

function PayDialog({ service, customerName, onPay, onClose }: {
  service: (typeof SERVICES)[number]; customerName: string; onPay: (o: PayOptions) => Promise<void>; onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(service.amount));
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenario, setScenario] = useState('SUCCESS');
  const [processing, setProcessing] = useState(10);
  const [resolution, setResolution] = useState<'never' | 'second' | 'global'>('never');
  const [submitting, setSubmitting] = useState(false);
  const [rzpEnabled, setRzpEnabled] = useState(false);
  const [method, setMethod] = useState<'RAZORPAY' | 'SIMULATED'>('SIMULATED');
  const [billerOutcome, setBillerOutcome] = useState<'POSTED' | 'DELAYED'>('POSTED');
  // One key per dialog: double-clicks and retries reuse it, so the server never creates a second payment
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    api.get<Scenario[]>('/api/simulator/scenarios').then(list => setScenarios(list.filter(x => x.key !== 'SETTLED_OK'))).catch(() => {});
    api.get<{ enabled: boolean }>('/api/razorpay/config')
      .then(c => { setRzpEnabled(c.enabled); if (c.enabled) setMethod('RAZORPAY'); }).catch(() => {});
  }, []);

  const selected = scenarios.find(x => x.key === scenario);
  const rechecks = method === 'RAZORPAY' ? billerOutcome === 'DELAYED' : RECHECK_SCENARIOS.includes(scenario);
  const submit = async () => {
    if (!(Number(amount) > 0)) return;
    setSubmitting(true);
    await onPay({
      method, biller_outcome: billerOutcome,
      amount_rs: Number(amount), idempotency_key: idempotencyKey, scenario, processing_seconds: processing,
      resolves_on_attempt: !rechecks || resolution === 'global' ? null : resolution === 'never' ? 0 : 2,
    });
    setSubmitting(false);
  };
  const field = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-paytm-cyan';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${service.tint}`}><service.icon className="h-5 w-5" /></div>
            <div>
              <div className="text-sm font-bold text-paytm-blue">{service.biller}</div>
              <div className="text-[11px] text-slate-500">Paying as {customerName}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">Amount (₹)</span>
          <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
            className="tnum mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-lg font-bold outline-none focus:border-paytm-cyan" />
        </label>

        <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
          {([['RAZORPAY', 'Razorpay (test mode)'], ['SIMULATED', 'Simulated gateway']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMethod(m)} disabled={m === 'RAZORPAY' && !rzpEnabled}
              title={m === 'RAZORPAY' && !rzpEnabled ? 'Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env' : undefined}
              className={`flex-1 rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${method === m ? 'bg-white text-paytm-blue shadow-xs' : 'text-slate-500'}`}>
              {label}
            </button>
          ))}
        </div>

        {method === 'RAZORPAY' ? (
          <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Real Razorpay checkout (test money)</div>
            <p className="text-[11px] leading-snug text-slate-600">
              In Checkout use UPI <b>success@razorpay</b> to pay or <b>failure@razorpay</b> to fail, or card <b>4111 1111 1111 1111</b> (any future expiry, any CVV).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600">After payment, the biller…</span>
                <select value={billerOutcome} onChange={e => setBillerOutcome(e.target.value as typeof billerOutcome)} className={field}>
                  <option value="POSTED">Confirms instantly</option>
                  <option value="DELAYED">Delays (Sahayak re-checks)</option>
                </select>
              </label>
              <label className={`block ${rechecks ? '' : 'opacity-40'}`}>
                <span className="text-[11px] font-medium text-slate-600">Sahayak's re-checks</span>
                <select value={resolution} disabled={!rechecks} onChange={e => setResolution(e.target.value as typeof resolution)} className={field}>
                  <option value="never">Never confirm → specialist</option>
                  <option value="second">Confirm on 2nd check</option>
                  <option value="global">Use queue settings</option>
                </select>
              </label>
            </div>
            <div className="font-mono text-[10px] text-slate-400">Idempotency key (order receipt): {idempotencyKey.slice(0, 18)}…</div>
          </div>
        ) : (
        <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Simulate what happens (demo)</div>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-600">Payment outcome</span>
            <select value={scenario} onChange={e => setScenario(e.target.value)} className={field}>
              <option value="SUCCESS">Normal payment: succeeds and biller confirms</option>
              {scenarios.map(x => <option key={x.key} value={x.key}>{x.title}</option>)}
            </select>
            {selected && <span className="mt-1 block text-[11px] leading-snug text-slate-500">{selected.description}</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-600">Bank responds after</span>
              <select value={processing} onChange={e => setProcessing(Number(e.target.value))} className={field}>
                {PROCESSING.map(p => <option key={p.s} value={p.s}>{p.label}</option>)}
              </select>
            </label>
            <label className={`block ${rechecks ? '' : 'opacity-40'}`}>
              <span className="text-[11px] font-medium text-slate-600">Sahayak's re-checks</span>
              <select value={resolution} disabled={!rechecks} onChange={e => setResolution(e.target.value as typeof resolution)} className={field}>
                <option value="never">Never confirm → specialist</option>
                <option value="second">Confirm on 2nd check</option>
                <option value="global">Use queue settings</option>
              </select>
            </label>
          </div>
          <div className="font-mono text-[10px] text-slate-400">Idempotency key: {idempotencyKey.slice(0, 18)}…</div>
        </div>
        )}

        <button onClick={submit} disabled={submitting}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-paytm-blue py-2.5 text-sm font-bold text-white hover:bg-paytm-dark disabled:opacity-60">
          <Plus className="h-4 w-4 text-paytm-cyan" /> {submitting ? 'Submitting…' : `${method === 'RAZORPAY' ? 'Pay with Razorpay' : 'Pay'} ${rupees(Number(amount) || 0)}`}
        </button>
      </div>
    </div>
  );
}

function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return m < 60 ? `${m}m ${String(s).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
