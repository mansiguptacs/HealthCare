import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships native WASM/data assets that must not be bundled by Turbopack;
  // keeping it external lets it resolve its files at runtime in local dev.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
