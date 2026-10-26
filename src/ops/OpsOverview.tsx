import { useEffect, useState } from 'react';
import { Bot, CalendarDays, CheckCircle2, Clock, Hourglass, UserRound } from 'lucide-react';
import { api, OUTCOME_META, type OpsOverview as Data, type Outcome } from '../api';
import { Card, Empty, rupees, timeAgo } from '../ui';

const ORDER: Outcome[] = ['AUTO_RESOLVED', 'HUMAN_RESOLVED', 'NEEDS_HUMAN', 'IN_PROGRESS'];
const PRESETS: Array<{ label: string; hours: number }> = [
  { label: '6h', hours: 6 }, { label: '24h', hours: 24 }, { label: '72h', hours: 72 },
  { label: '7d', hours: 168 }, { label: '30d', hours: 720 },
];

type Range = { kind: 'preset'; hours: number } | { kind: 'dates'; start: string; end: string };

const localDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export default function OpsOverview({ openTickets }: { openTickets: (o?: Outcome) => void }) {
  const [range, setRange] = useState<Range>({ kind: 'preset', hours: 24 });
  const today = localDate(new Date());
  const [from, setFrom] = useState(localDate(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = range.kind === 'preset'
    ? `hours=${range.hours}`
    : `start=${range.start}&end=${range.end}&tz_offset_min=${new Date().getTimezoneOffset()}`;

  useEffect(() => {
    const load = () => api.get<Data>(`/api/ops/overview?${query}`)
      .then(d => { setData(d); setError(null); })
      .catch(e => setError(String(e)));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [query]);

  const applyDates = () => {
    if (from > to) return setError('“From” must be on or before “To”');
    setRange({ kind: 'dates', start: from, end: to });
  };

  if (!data) return <Card><Empty>{error ? `Could not load: ${error}` : 'Loading dashboard…'}</Empty></Card>;
  const k = data.kpis;
  const fmtMin = (m: number | null) => (m == null ? '–' : m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`);
  const rangeLabel = range.kind === 'preset'
    ? `last ${PRESETS.find(p => p.hours === range.hours)?.label}`
    : range.start === range.end ? fmtDay(range.start) : `${fmtDay(range.start)} – ${fmtDay(range.end)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-paytm-blue">Resolution overview</h1>
          <p className="text-xs text-slate-500">Tickets opened {range.kind === 'preset' ? 'in the ' : 'on '}{rangeLabel} · refreshes every 5s</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setRange({ kind: 'preset', hours: p.hours }); setError(null); }}
                className={`rounded-md px-3 py-1 ${range.kind === 'preset' && range.hours === p.hours ? 'bg-paytm-blue text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className={`flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1 text-xs ${range.kind === 'dates' ? 'border-paytm-blue' : 'border-slate-200'}`}>
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <label className="flex items-center gap-1 text-slate-500">From
              <input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)}
                className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-800 outline-none focus:border-paytm-cyan" />
            </label>
            <label className="flex items-center gap-1 text-slate-500">To
              <input type="date" value={to} min={from} max={today} onChange={e => setTo(e.target.value)}
                className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-800 outline-none focus:border-paytm-cyan" />
            </label>
            <button onClick={applyDates} className="rounded-md bg-paytm-blue px-2.5 py-1 font-semibold text-white hover:bg-paytm-dark">Apply</button>
          </div>
        </div>
      </div>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      {/* KPI ribbon */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Tickets opened" value={k.tickets} sub={`${k.payments} payments · ${rupees(k.payment_volume_rs)}`} icon={<Clock className="h-4 w-4" />} />
        <Kpi label="Closed without a human" value={k.auto_resolved} accent="text-emerald-700"
          sub={k.auto_resolution_rate != null ? `${k.auto_resolution_rate}% of closed tickets` : 'no closed tickets yet'}
          bar={k.auto_resolution_rate ?? 0} barColor={OUTCOME_META.AUTO_RESOLVED.color}
          icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => openTickets('AUTO_RESOLVED')} />
        <Kpi label="Needs a human now" value={k.needs_human} accent="text-rose-600"
          sub={`${k.human_resolved} already resolved by specialists`} icon={<UserRound className="h-4 w-4" />}
          onClick={() => openTickets('NEEDS_HUMAN')} />
        <Kpi label="Agent working" value={k.in_progress} accent="text-amber-700"
          sub={`${k.pending_checks} re-check${k.pending_checks === 1 ? '' : 's'} queued`} icon={<Hourglass className="h-4 w-4" />}
          onClick={() => openTickets('IN_PROGRESS')} />
        <Kpi label="Median time to resolve" value={fmtMin(k.median_minutes_auto)}
          sub={`automatic · human ${fmtMin(k.median_minutes_human)} · agent turn ${k.median_turn_ms != null ? `${(k.median_turn_ms / 1000).toFixed(1)}s` : '–'}`}
          icon={<Bot className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title={`Tickets per ${data.window.granularity}, by current outcome`} className="lg:col-span-8">
          <HourlyChart data={data.hourly} daily={data.window.granularity === 'day'} />
        </Card>
        <Card title="Resolution breakdown" className="lg:col-span-4">
          <Breakdown kpis={k} onPick={openTickets} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="By issue type" className="lg:col-span-7">
          {data.by_issue.length === 0 ? <Empty>No tickets in this window</Empty> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  {ORDER.map(o => <th key={o} className="px-3 py-2 text-right font-medium">{OUTCOME_META[o].label}</th>)}
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-slate-100">
                {data.by_issue.map(r => (
                  <tr key={r.issue_type}>
                    <td className="px-5 py-2 text-xs font-medium text-slate-700">{r.issue_type.replaceAll('_', ' ').toLowerCase()}</td>
                    <td className="px-3 py-2 text-right text-xs font-bold">{r.total}</td>
                    {ORDER.map(o => <td key={o} className={`px-3 py-2 text-right text-xs ${r[o] ? 'text-slate-800' : 'text-slate-300'}`}>{r[o]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Live activity" className="lg:col-span-5">
          <ul className="thin-scroll max-h-[340px] divide-y divide-slate-100 overflow-y-auto">
            {data.events.map(e => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: OUTCOME_META[e.outcome].color }} />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-800">{describe(e)}</span>
                    <span className="shrink-0 text-slate-400">{timeAgo(e.at)}</span>
                  </div>
                  <div className="text-slate-400">{e.case_id} · {e.customer} · by {e.actor.replaceAll('_', ' ').toLowerCase()}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function describe(e: Data['events'][number]) {
  const d = e.details;
  switch (e.event_type) {
    case 'CREATED': return `Ticket opened (${String(d.issue_type || '').replaceAll('_', ' ').toLowerCase()})`;
    case 'VERIFICATION_SCHEDULED': return 'Re-check scheduled';
    case 'VERIFICATION_RETRY': return `Check ${d.attempt}/${d.max_attempts} not confirmed, retrying`;
    case 'ESCALATED': return 'Handed to a human specialist';
    case 'RESOLVED': return e.actor === 'HUMAN_SPECIALIST' ? 'Resolved by specialist' : 'Resolved automatically';
    default: return e.event_type.replaceAll('_', ' ').toLowerCase();
  }
}

function Kpi({ label, value, sub, icon, accent = 'text-slate-900', bar, barColor, onClick }: {
  label: string; value: number | string; sub: string; icon: React.ReactNode; accent?: string; bar?: number; barColor?: string; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-2xs transition-all enabled:hover:border-slate-300 enabled:hover:shadow-xs disabled:cursor-default">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="rounded-md bg-slate-50 p-1 text-slate-500">{icon}</span>
      </div>
      <div className={`tnum my-1.5 text-[26px] font-bold leading-tight ${accent}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
      {bar != null && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full" style={{ width: `${Math.min(bar, 100)}%`, background: barColor }} />
        </div>
      )}
    </button>
  );
}

function Breakdown({ kpis, onPick }: { kpis: Data['kpis']; onPick: (o: Outcome) => void }) {
  const counts: Record<Outcome, number> = {
    AUTO_RESOLVED: kpis.auto_resolved, HUMAN_RESOLVED: kpis.human_resolved, NEEDS_HUMAN: kpis.needs_human, IN_PROGRESS: kpis.in_progress,
  };
  const total = kpis.tickets || 1;
  return (
    <div className="space-y-4 p-5">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {ORDER.filter(o => counts[o]).map(o => (
          <div key={o} title={`${OUTCOME_META[o].label}: ${counts[o]}`} className="h-full"
            style={{ width: `${(counts[o] / total) * 100}%`, background: OUTCOME_META[o].color }} />
        ))}
      </div>
      <ul className="space-y-1">
        {ORDER.map(o => (
          <li key={o}>
            <button onClick={() => onPick(o)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUTCOME_META[o].color }} />
                {OUTCOME_META[o].label}
              </span>
              <span className="tnum font-semibold text-slate-900">
                {counts[o]} <span className="font-normal text-slate-400">· {Math.round((counts[o] / total) * 100)}%</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HourlyChart({ data, daily }: { data: Data['hourly']; daily: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 200, PAD_L = 28, PAD_B = 22, PAD_T = 8;
  const max = Math.max(1, ...data.map(d => ORDER.reduce((s, o) => s + d[o], 0)));
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max]));
  const slot = (W - PAD_L) / data.length;
  const barW = Math.max(3, Math.min(22, slot - 2));
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max);
  const labelEvery = Math.ceil(data.length / 6);
  const hourLabel = (iso: string) => daily
    ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
    : new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="px-5 pb-4 pt-3">
      <div className="mb-2 flex flex-wrap gap-4 text-[11px] text-slate-600">
        {ORDER.map(o => (
          <span key={o} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUTCOME_META[o].color }} />{OUTCOME_META[o].label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" onMouseLeave={() => setHover(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray={t ? '3 3' : undefined} />
              <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{t}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD_L + i * slot + (slot - barW) / 2;
            let acc = 0;
            const stacks = ORDER.filter(o => d[o]);
            return (
              <g key={d.hour} onMouseEnter={() => setHover(i)}>
                <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={H - PAD_T - PAD_B} fill={hover === i ? '#f1f5f9' : 'transparent'} />
                {stacks.map((o, j) => {
                  const top = y(acc + d[o]), bottom = y(acc);
                  acc += d[o];
                  const isTop = j === stacks.length - 1;
                  return (
                    <path key={o} fill={OUTCOME_META[o].color}
                      d={roundedTop(x, top, barW, Math.max(0, bottom - top - (isTop ? 0 : 2)), isTop ? 3 : 0)} />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{hourLabel(d.hour)}</text>
                )}
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
            style={{ left: `${Math.min(((PAD_L + hover * slot) / W) * 100, 75)}%` }}>
            <div className="mb-1 font-semibold text-slate-800">{hourLabel(data[hover].hour)}</div>
            {ORDER.map(o => (
              <div key={o} className="flex items-center justify-between gap-4 text-slate-600">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: OUTCOME_META[o].color }} />{OUTCOME_META[o].label}</span>
                <span className="tnum font-semibold text-slate-900">{data[hover][o]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Bar path with rounded top corners only, anchored flat on the baseline
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
