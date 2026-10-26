import { useEffect, useState, type ComponentType } from 'react';
import { ExternalLink, LogOut, ShieldCheck, Headphones, LayoutDashboard, ListChecks, RefreshCw, ScrollText, FlaskConical } from 'lucide-react';
import { api, type Outcome, type Stats } from '../api';
import { isAdmin, readStored, signInAsAdmin, signOutAdmin, store, useCustomers, useToast } from '../hooks';
import OpsOverview from './OpsOverview';
import OpsTickets from './OpsTickets';
import QueueTab from '../tabs/QueueTab';
import SpecialistTab from '../tabs/SpecialistTab';
import ScenariosTab from '../tabs/ScenariosTab';
import LogsTab from '../tabs/LogsTab';

type Page = 'overview' | 'tickets' | 'queue' | 'specialist' | 'scenarios' | 'logs';

const NAV: Array<{ id: Page; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tickets', label: 'Tickets', icon: ListChecks },
  { id: 'specialist', label: 'Specialist inbox', icon: Headphones },
  { id: 'queue', label: 'Follow-up queue', icon: RefreshCw },
  { id: 'scenarios', label: 'Test scenarios', icon: FlaskConical },
  { id: 'logs', label: 'Logs & traces', icon: ScrollText },
];

export default function OpsApp() {
  return isAdmin() ? <OpsConsole /> : <AdminSignIn />;
}

function AdminSignIn() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6faff] p-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <div className="flex items-center justify-center gap-2">
          <span className="rounded bg-paytm-blue px-2 py-0.5 text-lg font-bold tracking-tight text-white">pay<span className="text-paytm-cyan">tm</span></span>
          <span className="text-xs font-bold tracking-wide text-paytm-teal">OPS CONSOLE</span>
        </div>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#eaf5ff] text-paytm-teal"><ShieldCheck className="h-6 w-6" /></div>
        <div>
          <h1 className="text-lg font-bold text-paytm-blue">Paytm team only</h1>
          <p className="mt-1 text-sm text-slate-500">The resolution dashboard, tickets and specialist tools are for Paytm staff.</p>
        </div>
        <button onClick={signInAsAdmin} className="w-full rounded-xl bg-paytm-blue py-2.5 text-sm font-bold text-white hover:bg-paytm-dark">
          Sign in as Paytm Admin
        </button>
        <a href="/" className="block text-xs font-medium text-paytm-teal hover:underline">Back to the customer app</a>
      </div>
    </div>
  );
}

function OpsConsole() {
  const [page, setPage] = useState<Page>(() => {
    const p = readStored('sahayak.ops.page', 'overview');
    return (NAV.some(n => n.id === p) ? p : 'overview') as Page;
  });
  const [ticketFilter, setTicketFilter] = useState<Outcome | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [online, setOnline] = useState(true);
  const [toast, toastNode] = useToast();
  const customers = useCustomers();
  // Which customer test scenarios / queue filter act on (ops staff pick it; customers never see this)
  const [target, setTarget] = useState(() => readStored('sahayak.ops.target', 'CUST-101'));
  const targetName = customers.find(c => c.id === target)?.name || target;

  const go = (p: Page) => { setPage(p); store('sahayak.ops.page', p); };

  useEffect(() => {
    const load = () => api.get<Stats>('/api/stats').then(s => { setStats(s); setOnline(true); }).catch(() => setOnline(false));
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const badge: Partial<Record<Page, number>> = { specialist: stats?.escalated, queue: stats?.pending_checks };

  return (
    <div className="min-h-screen bg-[#f6faff]">
      <aside className="fixed left-0 top-0 z-50 flex h-full w-60 flex-col justify-between border-r border-slate-200 bg-white">
        <div>
          <div className="flex h-16 items-center justify-between border-b border-slate-200/80 bg-[#eaf5ff] px-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-paytm-blue px-2 py-0.5 text-lg font-bold tracking-tight text-white">pay<span className="text-paytm-cyan">tm</span></span>
              <span className="text-xs font-bold tracking-wide text-paytm-teal">OPS CONSOLE</span>
            </div>
            <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} title={online ? 'Backend live' : 'Backend offline'} />
          </div>
          <nav className="space-y-1 p-2">
            {NAV.map(n => (
              <button key={n.id} onClick={() => go(n.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  page === n.id ? 'bg-paytm-cyan font-semibold text-[#00465e] shadow-sm' : 'text-slate-600 hover:bg-[#d8ebfa] hover:text-slate-900'}`}>
                <n.icon className="h-4 w-4" />
                <span className="flex-1 text-left">{n.label}</span>
                {!!badge[n.id] && (
                  <span className={`tnum rounded-full px-1.5 text-[10px] font-bold ${n.id === 'specialist' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-700'}`}>{badge[n.id]}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {stats && (
          <div className="m-2 space-y-1.5 rounded-lg border border-slate-200/80 bg-[#eaf5ff] p-3 text-[11px] text-slate-600">
            <div className="flex justify-between"><span>Auto-resolved today</span><b className="tnum text-emerald-700">{stats.auto_resolved_today}</b></div>
            <div className="flex justify-between"><span>Agent turns today</span><b className="tnum text-slate-900">{stats.agent_turns_today}</b></div>
            <div className="flex justify-between"><span>Open cases</span><b className="tnum text-slate-900">{stats.open_cases}</b></div>
          </div>
        )}
      </aside>

      <div className="pl-60">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 backdrop-blur-md">
          <div className="text-sm text-slate-500">
            Sahayak · <span className="font-semibold text-slate-800">{NAV.find(n => n.id === page)?.label}</span>
          </div>
          <div className="flex items-center gap-3">
            {(page === 'scenarios' || page === 'queue') && (
              <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs">
                <span className="text-slate-500">Test customer</span>
                <select value={target} onChange={e => { setTarget(e.target.value); store('sahayak.ops.target', e.target.value); }}
                  className="bg-transparent font-semibold text-slate-800 outline-none">
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}
                </select>
              </label>
            )}
            <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-paytm-teal hover:underline">
              Customer app <ExternalLink className="h-3 w-3" />
            </a>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <div className="hidden text-right xl:block">
                <div className="text-xs font-bold text-slate-800">Paytm Admin</div>
                <div className="text-[10px] text-slate-500">Ops · full access</div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-paytm-teal text-xs font-bold text-white">PA</div>
              <button onClick={signOutAdmin} title="Sign out" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-6">
          {page === 'overview' && <OpsOverview openTickets={o => { setTicketFilter(o); go('tickets'); }} />}
          {page === 'tickets' && <OpsTickets initialOutcome={ticketFilter} toast={toast} openSpecialist={() => go('specialist')} />}
          {page === 'specialist' && <SpecialistTab toast={toast} onCountChange={() => {}} />}
          {page === 'queue' && <QueueTab customerId={target} toast={toast} />}
          {page === 'scenarios' && (
            <ScenariosTab customerId={target} customerName={targetName} toast={toast}
              openChat={() => { store('sahayak.customer', target); window.open('/', '_blank'); }}
              openQueue={() => go('queue')} />
          )}
          {page === 'logs' && <LogsTab />}
        </main>
      </div>
      {toastNode}
    </div>
  );
}
