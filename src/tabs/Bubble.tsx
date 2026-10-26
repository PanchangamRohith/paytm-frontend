import { Sparkles } from 'lucide-react';
import type { ChatMessage } from '../api';
import { renderMarkdown, timeAgo } from '../ui';

export default function Bubble({ m, onConsent }: { m: ChatMessage; onConsent?: (yes: boolean) => void }) {
  if (m.role === 'SYSTEM') {
    return (
      <div className="flex justify-center">
        <span className="max-w-[92%] rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-center text-[11px] text-amber-900">
          <b>Issue detected</b> · {m.content.replace('[System event] ', '').split(' needs attention')[0]}
        </span>
      </div>
    );
  }
  const meta = m.metadata || {};
  if (m.role === 'CUSTOMER') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-1">
          <div className="rounded-2xl rounded-tr-sm bg-paytm-blue px-3.5 py-2.5 leading-relaxed text-white"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
          <div className="pr-1 text-right text-[10px] text-slate-400">You{m.metadata?.channel === 'WHATSAPP' ? ' · via WhatsApp' : ''} · {timeAgo(m.created_at)}</div>
        </div>
      </div>
    );
  }
  const specialist = m.role === 'HUMAN_SPECIALIST';
  const auto = meta.trigger === 'WORKER' || meta.trigger === 'SYSTEM';
  return (
    <div className="flex items-start gap-2.5">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold shadow-2xs ${
        specialist ? 'bg-amber-500 text-white' : auto ? 'bg-paytm-blue text-white' : 'bg-paytm-cyan text-paytm-blue'}`}>
        {specialist ? 'SP' : 'AI'}
      </div>
      <div className="max-w-[88%] space-y-1">
        <div className={`rounded-2xl rounded-tl-sm border p-3.5 leading-relaxed shadow-2xs ${
          specialist ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-800'}`}>
          {auto && !specialist && (
            <div className="mb-1.5 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-paytm-teal">
              <Sparkles className="h-3 w-3" /> Proactive update
            </div>
          )}
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
          {onConsent && (
            <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
              <button onClick={() => onConsent(true)} className="rounded-lg bg-paytm-blue px-3 py-1.5 text-[11px] font-bold text-white hover:bg-paytm-dark">
                Yes, file the complaint
              </button>
              <button onClick={() => onConsent(false)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">
                No, keep tracking
              </button>
            </div>
          )}
          {meta.consent?.complaint_ref && (
            <div className="mt-2 inline-flex rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              Complaint {meta.consent.complaint_ref}
            </div>
          )}
        </div>
        <span className="pl-1 text-[10px] text-slate-400">
          {specialist ? 'Payments specialist' : 'Sahayak'}
          {meta.case_id ? ` · ${meta.case_id}` : ''}
          {meta.channel === 'WHATSAPP' ? ' · via WhatsApp' : ''}
          {meta.reply_source === 'TEMPLATE' ? ' · template (LLM unavailable)' : ''}
          {' · '}{timeAgo(m.created_at)}
        </span>
      </div>
    </div>
  );
}
