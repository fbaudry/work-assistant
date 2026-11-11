import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { openAIAuthPlugin } from './server/openai-plugin.mjs';

export default defineConfig({
  server: {
    fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.work-assistant/**'] },
    watch: { ignored: ['**/.work-assistant/**'] },
  },
  plugins: [react(), openAIAuthPlugin(), {
    name: 'development-react-preamble',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';");
    },
  }],
  base: './',
});
