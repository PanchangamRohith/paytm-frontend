import { useEffect, useState } from 'react';
import { api, type Customer } from './api';

export const readStored = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
export const store = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch {}
};

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const toast = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(t => (t === m ? null : t)), 3500);
  };
  const node = msg && (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-paytm-dark px-4 py-2.5 text-sm text-white shadow-lg">{msg}</div>
  );
  return [toast, node] as const;
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    const load = () => api.get<Customer[]>('/api/customers').then(setCustomers).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  return customers;
}


// Demo sign-in only (client-side role flag). Real access control needs staff auth on the /api/ops endpoints.
export const isAdmin = () => readStored('sahayak.role', '') === 'admin';
export function signInAsAdmin() {
  store('sahayak.role', 'admin');
  window.location.href = '/ops';
}
export function signOutAdmin() {
  store('sahayak.role', '');
  window.location.href = '/';
}
