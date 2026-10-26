import { useState } from 'react';
import { Bell } from 'lucide-react';
import { timeAgo } from '../ui';

export type Notice = { id: string; role: string; content: string; created_at: string; payment_id: string | null; case_id: string | null; unread: boolean };

type Props = { items: Notice[]; unread: number; onOpen: (n: Notice) => void; onMarkAll: () => void };

export default function NotificationBell({ items, unread, onOpen, onMarkAll }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} title="Notifications"
        className="relative rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-bold text-paytm-blue">Notifications</span>
              {unread > 0 && <button onClick={onMarkAll} className="text-[11px] font-medium text-paytm-teal hover:underline">Mark all read</button>}
            </div>
            <ul className="thin-scroll max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-xs text-slate-400">You're all caught up</li>}
              {items.map(n => (
                <li key={n.id}>
                  <button onClick={() => { setOpen(false); onOpen(n); }}
                    className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${n.unread ? 'bg-sky-50/50' : ''}`}>
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.unread ? 'bg-rose-500' : 'bg-transparent'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-[11px]">
                        <span className="font-bold text-slate-800">{n.role === 'HUMAN_SPECIALIST' ? 'Payments specialist replied' : 'Sahayak update'}</span>
                        <span className="shrink-0 text-slate-400">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.content.replace(/\*\*/g, '')}</p>
                      {n.payment_id && <span className="mt-1 inline-block font-mono text-[10px] text-slate-400">{n.payment_id}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
