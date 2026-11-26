import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const host = env.VITE_HOST?.trim() || '127.0.0.1';
  return {
    envDir: '..',
    plugins: [react(), tailwindcss()],
    server: { host },
    preview: { host }
  };
});
