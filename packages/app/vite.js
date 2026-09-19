import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.OPENCODE_CHANNEL === "latest") return "prod"
  return "dev"
})()

/**
 * @type {import("vite").PluginOption}
 */
export default [
  {
    name: "opencode-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        define: {
          "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify(channel),
        },
        worker: {
          format: "es",
        },
      }
    },
  },
  // NOTE: the theme preload is intentionally left as an external script
  // (/oc-theme-preload.js) instead of being inlined. Inlining required a CSP
  // sha256 hash of the inline body, which breaks whenever a proxy/edge rewrites
  // the HTML bytes (e.g. Cloudflare), causing the script to be CSP-blocked.
  tailwindcss(),
  solidPlugin(),
]
