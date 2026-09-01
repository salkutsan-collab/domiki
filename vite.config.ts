import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base = /domiki/ - страница живёт по адресу https://<аккаунт>.github.io/domiki/
export default defineConfig({
  base: '/domiki/',
  plugins: [react()],
  build: { outDir: 'dist' },
});
