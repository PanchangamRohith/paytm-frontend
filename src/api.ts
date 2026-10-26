export const API_BASE = 'http://localhost:8005';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  payment_count: number;
  open_case_count: number;
}

export interface Transaction {
  id: string;
  biller_name: string;
  account_number: string;
  amount_rs: number;
  provider_status: string;
  acknowledgement_status: string;
  biller_posting_status: string;
  refund_status: string;
  created_at: string;
  processing?: { polls: number; answer_in_seconds: number; gateway?: boolean } | null;
  provider_tx_id?: string | null;
  refunded_rs?: number | null;
  duplicate_of?: string | null;
}

export interface SupportCase {
  id: string;
  payment_id: string;
  issue_type: string;
  status: string;
  summary: string;
  resolution_summary: string | null;
  opened_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'CUSTOMER' | 'AI_TEAMMATE' | 'HUMAN_SPECIALIST' | 'SYSTEM';
  kind?: string;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface Scenario {
  key: string;
  title: string;
  description: string;
  biller_name: string;
  amount_rs: number;
  state: Record<string, string>;
  curl: string;
}

export interface ScenarioResult {
  scenario: string;
  customer_id: string;
  payment_id: string;
  biller_name: string;
  amount_rs: number;
  agent?: { content: string; case_id: string | null; status: string; intents: string[]; latency_ms: number } | null;
}

export interface QueueItem {
  id: string;
  case_id: string;
  customer_id: string;
  payment_id: string | null;
  verification_type: string;
  biller_name: string | null;
  amount_rs: number | null;
  status: string;
  case_status: string;
  attempt_number: number;
  max_attempts: number;
  due_at: string;
  seconds_until_due: number | null;
  next_retry_delay_seconds: number | null;
  completed_at: string | null;
}

export interface EscalatedCase {
  id: string;
  customer_id: string;
  customer_name: string;
  issue_type: string;
  reason: string | null;
  priority: string | null;
  claimed_by?: string | null;
  handoff_summary: string | null;
  escalated_at: string;
  brief: {
    customer_request: string | null;
    customer_request_at: string | null;
    payment_status: Array<{ rail: string; status: string }>;
    paid_at: string | null;
    agent_actions: Array<{ at: string; step: string; by: string; result: string }>;
    checks: { run: number; pending: number; cancelled: number };
    complaint: { ref: string; status: string; sla_hours: number } | null;
    consent: { status: string; question: string } | null;
  };
  payment: { id: string; biller_name: string; amount_rs: number; provider_status: string; biller_posting_status: string; refund_status: string; razorpay?: boolean } | null;
}

export interface CaseEvent {
  id: string;
  event_type: string;
  actor_type: string;
  from_status: string | null;
  to_status: string | null;
  details: Record<string, any>;
  created_at: string;
}

export interface Trace {
  id: string;
  name: string;
  actor_role: string;
  case_id?: string;
  latency_ms: number;
  status: string;
  input: any;
  output: any;
  metadata: any;
  created_at: string;
}

export interface LogEntry {
  id: string;
  time: string;
  category: string;
  emoji?: string;
  msg: string;
  meta?: Record<string, any>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = (await res.json()).detail ?? detail; } catch {}
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T,>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Customer-facing wording for the payment's independent status dimensions
export function paymentStatus(
  t: Pick<Transaction, 'provider_status' | 'biller_posting_status' | 'refund_status'> & { duplicate_of?: string | null },
): { label: string; tone: Tone } {
  if (t.duplicate_of && t.refund_status !== 'COMPLETED') return { label: 'Possible duplicate', tone: 'red' };
  if (t.provider_status === 'AUTHORIZED') return { label: 'Money held · not taken', tone: 'amber' };
  if (t.provider_status === 'RELEASED') return { label: 'Hold released', tone: 'slate' };
  if (t.refund_status === 'PARTIAL') return { label: 'Partially refunded', tone: 'blue' };
  if (t.provider_status === 'ABANDONED') return { label: 'Not completed', tone: 'slate' };
  if (['PENDING', 'INITIATED'].includes(t.provider_status)) return { label: 'Processing', tone: 'blue' };
  if (t.refund_status === 'COMPLETED') return { label: 'Refunded', tone: 'green' };
  if (t.provider_status === 'FAILED') return { label: `Failed · refund ${t.refund_status.toLowerCase().replace('_', ' ')}`, tone: 'red' };
  if (t.provider_status === 'UNKNOWN') return { label: 'Confirming with bank', tone: 'amber' };
  if (t.biller_posting_status === 'POSTED') return { label: 'Paid', tone: 'green' };
  if (t.provider_status === 'SUCCESS') return { label: 'Paid · biller pending', tone: 'amber' };
  return { label: t.provider_status.toLowerCase(), tone: 'slate' };
}

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate';

export function caseTone(status: string): Tone {
  if (status === 'RESOLVED' || status === 'EXECUTED') return 'green';
  if (status === 'ESCALATED' || status === 'FAILED') return 'red';
  if (status === 'WAITING' || status === 'PENDING' || status === 'INVESTIGATING') return 'amber';
  return 'slate';
}

export interface Stats {
  auto_resolved_today: number;
  open_cases: number;
  escalated: number;
  pending_checks: number;
  agent_turns_today: number;
  avg_turn_latency_ms: number;
}

export type Outcome = 'AUTO_RESOLVED' | 'HUMAN_RESOLVED' | 'NEEDS_HUMAN' | 'IN_PROGRESS';

export const OUTCOME_META: Record<Outcome, { label: string; color: string; tone: Tone }> = {
  AUTO_RESOLVED: { label: 'Auto-resolved', color: '#1fa971', tone: 'green' },
  HUMAN_RESOLVED: { label: 'Resolved by human', color: '#3f5ba3', tone: 'blue' },
  NEEDS_HUMAN: { label: 'Needs human', color: '#e0475b', tone: 'red' },
  IN_PROGRESS: { label: 'Agent working', color: '#e8a020', tone: 'amber' },
};

export interface OpsOverview {
  window: { since: string; until: string; granularity: 'hour' | 'day' };
  kpis: {
    tickets: number; auto_resolved: number; human_resolved: number; needs_human: number; in_progress: number;
    auto_resolution_rate: number | null; median_minutes_auto: number | null; median_minutes_human: number | null;
    pending_checks: number; payments: number; payment_volume_rs: number; agent_turns: number; median_turn_ms: number | null;
  };
  hourly: Array<{ hour: string } & Record<Outcome, number>>;
  by_issue: Array<{ issue_type: string; total: number } & Record<Outcome, number>>;
  events: Array<{ id: string; case_id: string; customer: string; event_type: string; actor: string; to_status: string | null; outcome: Outcome; details: Record<string, any>; at: string }>;
}

export interface Ticket {
  case_id: string;
  customer_id: string;
  customer_name: string;
  issue_type: string;
  status: string;
  outcome: Outcome;
  resolution_mode: string | null;
  human_interventions: number;
  summary: string | null;
  payment: { id: string; biller_name: string; amount_rs: number; provider_status: string; biller_posting_status: string; refund_status: string } | null;
  checks_run: number;
  complaint_ref: string | null;
  pending_check: { id: string; attempt: number; max_attempts: number; due_in_seconds: number } | null;
  opened_at: string;
  resolved_at: string | null;
  minutes_to_resolve: number | null;
}
