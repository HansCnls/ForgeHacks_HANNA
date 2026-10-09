/** @type {import('next').NextConfig} */
const nextConfig = {
  // La interfaz principal es public/index.html (HTML estático). Se sirve en "/".
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
    };
  },
};

export default nextConfig;
