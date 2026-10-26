import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api, type Customer } from './api';
import { readStored, signInAsAdmin, store, useCustomers, useToast } from './hooks';
import ConsumerTab from './tabs/ConsumerTab';
import NotificationBell, { type Notice } from './tabs/NotificationBell';
import OpsApp from './ops/OpsApp';

const ADMIN = '__ADMIN__';

// One codebase, two audiences: customers at "/", Paytm team at "/ops"
export default function App() {
  return window.location.pathname.startsWith('/ops') ? <OpsApp /> : <ConsumerApp />;
}

function ConsumerApp() {
  const customers = useCustomers();
  const [customerId, setCustomerId] = useState(() => readStored('sahayak.customer', 'CUST-101'));
  const [toast, toastNode] = useToast();
  const customerName = customers.find(c => c.id === customerId)?.name || customerId;
  const initials = customerName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [notices, setNotices] = useState<{ unread: number; items: Notice[] }>({ unread: 0, items: [] });
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);

  const loadNotices = () =>
    api.get<{ unread: number; items: Notice[] }>(`/api/customers/${customerId}/notifications`).then(setNotices).catch(() => {});
  useEffect(() => {
    setNotices({ unread: 0, items: [] });
    loadNotices();
    const t = setInterval(loadNotices, 5000);
    return () => clearInterval(t);
  }, [customerId]);

  const unreadByPayment = notices.items.reduce<Record<string, number>>((acc, n) => {
    if (n.unread && n.payment_id) acc[n.payment_id] = (acc[n.payment_id] || 0) + 1;
    return acc;
  }, {});
  const openNotice = async (n: Notice) => {
    await api.post(`/api/customers/${customerId}/notifications/read`, { ids: [n.id] }).catch(() => {});
    if (n.payment_id) setFocus({ id: n.payment_id, n: Date.now() });
    loadNotices();
  };
  const markAll = async () => {
    await api.post(`/api/customers/${customerId}/notifications/read`, {}).catch(() => {});
    loadNotices();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-[0_2px_12px_rgba(4,27,62,0.04)] backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded bg-paytm-blue px-2.5 py-1 text-xl font-black leading-none tracking-tight text-white shadow-sm">
              pay<span className="text-paytm-cyan">tm</span>
            </div>
            <div className="mx-0.5 h-6 w-px bg-slate-200" />
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-tight text-paytm-blue">Sahayak AI</span>
              <span className="text-[10px] font-medium text-slate-500">Recharge, bills & payment help</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
          <NotificationBell items={notices.items} unread={notices.unread} onOpen={openNotice} onMarkAll={markAll} />
          {/* Demo stand-in for login: pick which customer you are */}
          <label className="relative flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 pr-2.5 shadow-xs hover:border-paytm-cyan/50">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-paytm-blue to-paytm-cyan text-xs font-bold text-white">{initials}</div>
            <div className="hidden flex-col text-left sm:flex">
              <span className="text-[10px] font-medium leading-none text-slate-400">Signed in as</span>
              <span className="mt-0.5 text-xs font-bold leading-tight text-slate-900">{customerName}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            <select value={customerId} onChange={e => {
                if (e.target.value === ADMIN) return signInAsAdmin();
                setCustomerId(e.target.value);
                store('sahayak.customer', e.target.value);
              }}
              className="absolute inset-0 cursor-pointer opacity-0">
              <optgroup label="Customers">
                {(customers.length ? customers : [{ id: customerId, name: customerId } as Customer]).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Paytm team">
                <option value={ADMIN}>Paytm Admin (ops dashboard)</option>
              </optgroup>
            </select>
          </label>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
        <ConsumerTab customerId={customerId} customerName={customerName} toast={toast}
          focusPayment={focus} unread={unreadByPayment} onRead={loadNotices} />
      </main>
      {toastNode}
    </div>
  );
}
