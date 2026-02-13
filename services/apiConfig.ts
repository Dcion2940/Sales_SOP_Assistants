const envChatApiBase = import.meta.env.VITE_CHAT_API_BASE || import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL;
const envSopApiBase = import.meta.env.VITE_SOP_API_BASE || import.meta.env.VITE_BACKEND_API_BASE;

export const CHAT_API_BASE = envChatApiBase || 'https://preflood-reid-conversable.ngrok-free.dev/webhook';
export const SOP_API_BASE = envSopApiBase || (/(\/webhook(\/|$))/i.test(CHAT_API_BASE) ? '' : CHAT_API_BASE);

export const isWebhookBase = (value: string): boolean => /\/webhook(\/|$)/i.test(value);

export const RUNTIME_DEBUG_ENABLED = (() => {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('debug') || window.localStorage.getItem('debugWebhook') === '1';
})();
