// En dev (Vite proxy): API_URL = '' → requests a /api/* se reenvían a localhost:4012
// En producción (Netlify build): VITE_API_URL = 'https://...' desde .env.production
export const API_URL = import.meta.env.VITE_API_URL ?? '';
