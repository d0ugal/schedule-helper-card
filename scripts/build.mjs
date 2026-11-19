import { build } from "esbuild";

await build({
  entryPoints: ["src/schedule-helper-card.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  outfile: "dist/schedule-helper-card.js",
});
