import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import glsl from "vite-plugin-glsl";
import { ViteMpPlugin } from "vite-plugin-mp";

console.log(react, glsl, ViteMpPlugin);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), glsl(), ViteMpPlugin()],
  base: "/soulful_fibre",
});
