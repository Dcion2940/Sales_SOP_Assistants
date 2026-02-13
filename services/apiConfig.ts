const envApiBase = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL;

export const API_BASE = envApiBase || 'https://preflood-reid-conversable.ngrok-free.dev/webhook';

export const isWebhookBase = (value: string): boolean => /\/webhook(\/|$)/i.test(value);

export const RUNTIME_DEBUG_ENABLED = (() => {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('debug') || window.localStorage.getItem('debugWebhook') === '1';
})();
