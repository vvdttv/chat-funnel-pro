import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // recharts + d3 só aparecem na tela de indicadores — isolar reduz o bundle inicial.
          // ATENÇÃO: as outras regras (react-vendor / radix / supabase / query) causavam
          // TDZ "Cannot access 'S' before initialization" em build minificado. Não reintroduzir
          // sem testar com `vite preview` numa porta + abrir /auth e confirmar console limpo.
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory-vendor")) {
            return "charts";
          }
        },
      },
    },
  },
}));
