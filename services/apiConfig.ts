const envApiBase = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL;

export const API_BASE = envApiBase || 'https://preflood-reid-conversable.ngrok-free.dev/webhook';
