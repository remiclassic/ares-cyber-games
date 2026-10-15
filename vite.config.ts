import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // React is used by the Privilege Path Puzzle (React Flow) and Cyber Dispatch.
  plugins: [react()],
  build: {
    rollupOptions: {
      // One static page per practice.
      input: { bits: "bits.html", blastradius: "blastradius.html", cloud: "cloud.html", counterplay: "counterplay.html", defense: "defense.html", index: "index.html", "network-defense": "network-defense.html", dispatch: "dispatch.html", phishing: "phishing.html", privilege: "privilege.html", queryhunt: "queryhunt.html", risks: "risks.html", rules: "rules.html", soc: "soc.html", stack: "stack.html", triage: "triage.html" },
    },
  },
});
