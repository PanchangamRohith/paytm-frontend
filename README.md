# Sahayak: frontend

React + TypeScript + Vite + Tailwind v4 UI for Sahayak, the autonomous AI payment-support teammate.

- `/`: customer app (Paytm-style home, payments, chat with the agent, notifications)
- `/ops`: ops console for Paytm staff (overview, tickets, specialist queue, retry queue, logs). Pick "Paytm Admin" in the user selector.

Backend: https://github.com/PanchangamRohith/paytm-backend (expected at `http://localhost:8005`, set in `src/api.ts`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```
