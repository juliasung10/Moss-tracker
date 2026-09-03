import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM database drivers must be resolved at runtime, not bundled.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default nextConfig;
