import type { ReactNode } from 'react';
import type { Tone } from './api';

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-300',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  blue: 'bg-sky-50 text-paytm-teal ring-sky-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-paytm-blue">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
};

const VARIANTS = {
  primary: 'bg-paytm-blue text-white shadow-sm hover:bg-paytm-dark',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 shadow-xs hover:ring-slate-300',
  ghost: 'text-paytm-teal hover:bg-sky-50',
  danger: 'bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
};

export function Button({ children, onClick, variant = 'secondary', disabled, title }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-400">{children}</div>;
}

export function CopyCommand({ label, command, onCopied }: { label: string; command: string; onCopied: () => void }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-slate-500">{label}</div>
      <button
        onClick={() => { navigator.clipboard.writeText(command); onCopied(); }}
        title="Copy"
        className="block w-full break-all rounded-lg bg-slate-900 px-3 py-2 text-left font-mono text-[11px] text-emerald-300 hover:bg-slate-800"
      >
        {command}
      </button>
    </div>
  );
}

// Escape first so message content can never inject HTML, then apply minimal markdown
export function renderMarkdown(text: string) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 text-[0.85em]">$1</code>')
    .replace(/\n/g, '<br/>');
}

export const rupees = (n: number | null | undefined) =>
  n == null ? '–' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const timeAgo = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
