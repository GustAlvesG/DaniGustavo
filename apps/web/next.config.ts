import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      // Tailwind só no CSS global do app: com `as: "*.css"`, um *.module.css
      // virava CSS global e as classes do módulo chegavam vazias.
      "*.css": {
        condition: { not: { any: [{ path: /\.module\.css$/ }, "foreign"] } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
