import * as fs from "fs";
import * as path from "path";
import * as _ from "underscore";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import glsl from "vite-plugin-glsl";
import { ViteMpPlugin } from "vite-plugin-mp";

console.log(react, glsl, ViteMpPlugin);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), glsl(), ViteMpPlugin()],
  base: "/soulful_fibre",
  build: {
    minify: false,
    rollupOptions: { plugins: [mediapipe_workaround()] },
  },
});

// https://github.com/google/mediapipe/issues/2883
// https://github.com/shiguredo/media-processors/blob/develop/packages/virtual-background/rollup.config.mjs

const mediapipe_patches = {
  "holistic.js": [
    "Holistic",
    "FACEMESH_TESSELATION",
    "HAND_CONNECTIONS",
    "POSE_CONNECTIONS",
    "POSE_LANDMARKS",
  ],
  "camera_utils.js": ["Camera"],
};
function mediapipe_workaround() {
  return {
    name: "mediapipe_workaround",
    load(id) {
      const bn = path.basename(id);
      if (_.has(mediapipe_patches, bn)) {
        let code = fs.readFileSync(id, "utf-8");

        _.each(mediapipe_patches[bn], (export_name: string) => {
          code += "exports." + export_name + " = " + export_name + ";\n";
        });

        return { code };
      } else {
        return null;
      }
    },
  };
}
