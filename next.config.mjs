/** @type {import('next').NextConfig} */
function normalizeOrigins(...values) {
  const origins = new Set()

  values
    .flatMap((value) => {
      if (!value) return []

      if (Array.isArray(value)) {
        return value
      }

      return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    })
    .forEach((raw) => {
      try {
        const url = raw.includes('://') ? new URL(raw) : new URL(`http://${raw}`)
        origins.add(url.origin)
      } catch (_) {
        // Ignora entradas inválidas
      }
    })

  return Array.from(origins)
}

const fallbackDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://0.0.0.0:3000',
  'http://192.168.113.2:3000',
  'http://192.168.1.110:3000',
  'http://82.25.66.17:3005',
]

const envAwareDevOrigins = normalizeOrigins(
  fallbackDevOrigins,
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.PUBLIC_HOST,
  process.env.COOLIFY_APPLICATION_URL,
  process.env.ALLOWED_DEV_ORIGINS
)

const nextConfig = {
  // Essencial para o Docker standalone funcionar
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  // Configuração do Turbopack para silenciar avisos (se usado)
  turbopack: {},
  // Configuração para permitir cross-origin requests em desenvolvimento
  allowedDevOrigins: envAwareDevOrigins,
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
