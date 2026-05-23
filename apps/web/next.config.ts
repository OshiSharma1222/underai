import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@underai/shared"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
