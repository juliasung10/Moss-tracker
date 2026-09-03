import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The libSQL client pulls in optional native bindings for local file databases;
  // keep it out of the bundle so the server resolves it at runtime instead.
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
