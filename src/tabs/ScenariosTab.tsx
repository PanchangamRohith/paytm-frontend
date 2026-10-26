import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { API_BASE, api, type Scenario, type ScenarioResult, type Transaction } from '../api';
import { Badge, Button, Card, CopyCommand, Empty, rupees } from '../ui';

type Props = { customerId: string; customerName: string; toast: (m: string) => void; openChat: () => void; openQueue: () => void };

export default function ScenariosTab({ customerId, customerName, toast, openChat, openQueue }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  useEffect(() => {
    api.get<Scenario[]>('/api/simulator/scenarios').then(setScenarios).catch(() => {});
  }, []);

  useEffect(() => setResult(null), [customerId]);

  const run = async (key: string) => {
    setRunning(key);
    try {
      setResult(await api.post<ScenarioResult>(`/api/simulator/scenarios/${key}/run`, { customer_id: customerId }));
    } catch (e) {
      toast(`Scenario failed: ${e}`);
    } finally {
      setRunning(null);
    }
  };

  // Upstream callbacks act on this customer's first matching payment
  const callback = async (kind: 'biller' | 'refund') => {
    try {
      const txns = await api.get<Transaction[]>(`/api/transactions?customer_id=${customerId}`);
      const target = kind === 'biller'
        ? txns.find(t => t.biller_posting_status === 'PENDING')
        : txns.find(t => ['PENDING', 'INITIATED'].includes(t.refund_status));
      if (!target) return toast(`${customerName} has no payment with a pending ${kind === 'biller' ? 'biller posting' : 'refund'}`);
      await api.post(`/api/simulator/${kind === 'biller' ? 'trigger-biller-posted' : 'trigger-refund-processed'}/${target.id}`);
      toast(`${kind === 'biller' ? 'Biller posted' : 'Refund credited'}: ${target.id}`);
    } catch (e) {
      toast(`Callback failed: ${e}`);
    }
  };

  const curlFor = (key: string) =>
    `curl -s -X POST ${API_BASE}/api/simulator/scenarios/${key}/run -H 'Content-Type: application/json' -d '{"customer_id":"${customerId}"}'`;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Each scenario creates a payment for <b className="text-slate-700">{customerName}</b> and immediately triggers the agent,
        which investigates, messages the customer and queues a re-check when needed.
      </p>

      {result && (
        <Card>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="text-sm font-medium text-slate-800">
                {result.scenario.replaceAll('_', ' ').toLowerCase()} · {result.biller_name} {rupees(result.amount_rs)}
                <span className="ml-2 font-mono text-xs text-slate-400">{result.payment_id}</span>
              </div>
              {result.agent && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="blue">{result.agent.intents?.join(', ')}</Badge>
                    <Badge>{result.agent.status?.toLowerCase()}</Badge>
                    {result.agent.case_id && <Badge>{result.agent.case_id}</Badge>}
                    <Badge>{result.agent.latency_ms} ms</Badge>
                  </div>
                  <p className="text-sm text-slate-600">“{result.agent.content}”</p>
                </>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button onClick={openQueue}>View queue</Button>
              <Button variant="primary" onClick={openChat}>Open customer's chat</Button>
            </div>
          </div>
        </Card>
      )}

      {scenarios.length === 0 ? (
        <Card><Empty>Scenario catalogue unavailable. Is the backend running on {API_BASE}?</Empty></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map(sc => (
            <Card key={sc.key} className="flex flex-col">
              <div className="flex-1 space-y-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{sc.title}</h3>
                  <span className="text-xs text-slate-400">{rupees(sc.amount_rs)}</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">{sc.description}</p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
                <button onClick={() => { navigator.clipboard.writeText(curlFor(sc.key)); toast('curl copied'); }}
                  className="text-[11px] text-slate-400 hover:text-sky-700">Copy curl</button>
                <Button variant="primary" onClick={() => run(sc.key)} disabled={running !== null}>
                  <Play className="h-3 w-3" />{running === sc.key ? 'Running agent…' : 'Run'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Upstream callbacks">
          <div className="divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm text-slate-700">Biller confirms posting</div>
                <div className="text-[11px] text-slate-400">Resolves {customerName}'s first payment awaiting the biller</div>
              </div>
              <Button onClick={() => callback('biller')}>Send</Button>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm text-slate-700">Bank credits refund</div>
                <div className="text-[11px] text-slate-400">Completes {customerName}'s first pending refund</div>
              </div>
              <Button onClick={() => callback('refund')}>Send</Button>
            </div>
          </div>
        </Card>

        <Card title="curl">
          <div className="space-y-3 p-4">
            <CopyCommand label="List scenarios" command={`curl -s ${API_BASE}/api/simulator/scenarios`} onCopied={() => toast('Copied')} />
            <CopyCommand label={`Failed payment for ${customerId} (agent runs automatically)`} command={curlFor('FAILED_REFUND_PENDING')} onCopied={() => toast('Copied')} />
            <CopyCommand label="Chat as this customer" command={`curl -s -X POST ${API_BASE}/api/chat/messages -H 'Content-Type: application/json' -d '{"customer_id":"${customerId}","client_message_id":"cli-'$(date +%s)'","content":"Which of my payments are pending?"}'`} onCopied={() => toast('Copied')} />
          </div>
        </Card>
      </div>
    </div>
  );
}
