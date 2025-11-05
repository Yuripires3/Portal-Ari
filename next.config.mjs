/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Configuração do Turbopack para silenciar avisos
  turbopack: {},
  // Configuração para permitir cross-origin requests em desenvolvimento
  allowedDevOrigins: ['192.168.113.2', '192.168.1.110', 'http://192.168.1.110:3000'],
  webpack: (config, { isServer }) => {
    // Ignorar módulos que não devem ser bundleados (ex: xlsx que é carregado via CDN)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    return config
  },
} 

export default nextConfig