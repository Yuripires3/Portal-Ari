#!/usr/bin/env node

const os = require('os');

// Função para resolver a URL pública base da aplicação
// Prioriza: NEXT_PUBLIC_SITE_URL > PUBLIC_HOST > IP detectado automaticamente
function resolvePublicBaseUrl() {
  const port = process.env.PORT || '3005';
  
  // 1. Tentar NEXT_PUBLIC_SITE_URL (padrão Next.js)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    let url = process.env.NEXT_PUBLIC_SITE_URL.trim();
    // Se não tiver protocolo, adicionar http://
    if (!url.match(/^https?:\/\//)) {
      url = `http://${url}`;
    }
    // Garantir que não termina com /
    return url.replace(/\/$/, '');
  }
  
  // 2. Tentar PUBLIC_HOST
  if (process.env.PUBLIC_HOST) {
    let host = process.env.PUBLIC_HOST.trim();
    // Se não tiver protocolo, adicionar http://
    if (!host.match(/^https?:\/\//)) {
      host = `http://${host}`;
    }
    // Garantir que não termina com /
    return host.replace(/\/$/, '');
  }
  
  // 3. Fallback: detectar IP automaticamente
  const detectedIP = getLocalIP();
  if (detectedIP && detectedIP !== '0.0.0.0') {
    return `http://${detectedIP}:${port}`;
  }
  
  // 4. Último fallback
  return `http://0.0.0.0:${port}`;
}

// Função para obter o IP real da máquina (para fallback)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  // Coletar todos os IPs não-internos
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignorar IPv6 e interfaces internas (loopback)
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  
  // Priorizar IPs que não são 172.x.x.x ou 192.168.x.x (IPs públicos primeiro)
  const publicIPs = ips.filter(ip => !ip.startsWith('172.') && !ip.startsWith('192.168.'));
  if (publicIPs.length > 0) {
    return publicIPs[0];
  }
  
  // Se não houver IP público, usar o primeiro IP privado
  if (ips.length > 0) {
    return ips[0];
  }
  
  // Fallback para null (será tratado em resolvePublicBaseUrl)
  return null;
}

// Configurar variáveis de ambiente para o servidor escutar corretamente
const listenHost = '0.0.0.0';
process.env.HOST = process.env.HOST || listenHost;
process.env.HOSTNAME = process.env.HOSTNAME || listenHost;
process.env.PORT = process.env.PORT || '3005';

// Resolver URL pública base
const publicBaseUrl = resolvePublicBaseUrl();

// Definir variáveis de ambiente para o Next.js usar
if (!process.env.NEXT_PUBLIC_SITE_URL && !process.env.PUBLIC_HOST) {
  // Se não foi definido, definir automaticamente
  process.env.NEXT_PUBLIC_SITE_URL = publicBaseUrl;
}

// Função para substituir URLs nos logs usando a URL pública resolvida
function replaceUrlsInLogs(message) {
  if (typeof message === 'string') {
    // Extrair apenas o host:port da URL pública
    const publicUrlMatch = publicBaseUrl.match(/https?:\/\/([^\/]+)/);
    const publicHost = publicUrlMatch ? publicUrlMatch[1] : null;
    
    if (publicHost) {
      // Substituir hostname do container por host público
      // Padrão: http://container-hostname:port -> http://public-host:port
      return message
        // Substituir qualquer hostname hex (container ID) pelo host público
        .replace(/http:\/\/([a-f0-9]{8,12}):(\d+)/gi, `http://${publicHost}`)
        .replace(/http:\/\/([a-f0-9]{8,12})/gi, `http://${publicHost}`)
        // Substituir qualquer hostname alfanumérico que não seja IP válido
        .replace(/http:\/\/(?!\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})([a-zA-Z0-9-]+):(\d+)/g, `http://${publicHost}`)
        .replace(/http:\/\/(?!\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})([a-zA-Z0-9-]+)/g, `http://${publicHost}`);
    }
  }
  return message;
}

// Interceptar process.stdout.write (usado pelo Next.js para logs)
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function(chunk, encoding, callback) {
  if (typeof chunk === 'string') {
    chunk = replaceUrlsInLogs(chunk);
    return originalStdoutWrite(chunk, encoding, callback);
  } else if (Buffer.isBuffer(chunk)) {
    const str = chunk.toString('utf8');
    const replaced = replaceUrlsInLogs(str);
    if (str !== replaced) {
      chunk = Buffer.from(replaced, 'utf8');
    }
    return originalStdoutWrite(chunk, encoding, callback);
  }
  return originalStdoutWrite(chunk, encoding, callback);
};

// Interceptar process.stderr.write
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function(chunk, encoding, callback) {
  if (typeof chunk === 'string') {
    chunk = replaceUrlsInLogs(chunk);
    return originalStderrWrite(chunk, encoding, callback);
  } else if (Buffer.isBuffer(chunk)) {
    const str = chunk.toString('utf8');
    const replaced = replaceUrlsInLogs(str);
    if (str !== replaced) {
      chunk = Buffer.from(replaced, 'utf8');
    }
    return originalStderrWrite(chunk, encoding, callback);
  }
  return originalStderrWrite(chunk, encoding, callback);
};

// Interceptar métodos de console
const originalLog = console.log;
const originalInfo = console.info;

console.log = function(...args) {
  const modifiedArgs = args.map(arg => 
    typeof arg === 'string' ? replaceUrlsInLogs(arg) : arg
  );
  originalLog.apply(console, modifiedArgs);
};

console.info = function(...args) {
  const modifiedArgs = args.map(arg => 
    typeof arg === 'string' ? replaceUrlsInLogs(arg) : arg
  );
  originalInfo.apply(console, modifiedArgs);
};

// Sanity check e log de inicialização
const port = process.env.PORT || '3005';
const host = process.env.HOST || '0.0.0.0';

if (process.env.PUBLIC_HOST || process.env.NEXT_PUBLIC_SITE_URL) {
  console.log(`✅ Ready on ${publicBaseUrl}`);
  console.log(`📡 Server listening on ${host}:${port}`);
  console.log(`🌐 Public URL: ${publicBaseUrl}`);
} else {
  const detectedIP = getLocalIP();
  if (detectedIP && detectedIP !== '0.0.0.0') {
    console.log(`⚠️  PUBLIC_HOST or NEXT_PUBLIC_SITE_URL not set, using detected IP: ${publicBaseUrl}`);
    console.log(`📡 Server listening on ${host}:${port}`);
    console.log(`💡 To set a custom public URL, define PUBLIC_HOST or NEXT_PUBLIC_SITE_URL environment variable`);
  } else {
    console.log(`⚠️  PUBLIC_HOST or NEXT_PUBLIC_SITE_URL not set and could not detect IP`);
    console.log(`📡 Server listening on ${host}:${port}`);
    console.log(`💡 Please define PUBLIC_HOST or NEXT_PUBLIC_SITE_URL environment variable`);
    console.log(`   Example: PUBLIC_HOST=192.168.1.100:${port} or NEXT_PUBLIC_SITE_URL=http://192.168.1.100:${port}`);
  }
}

// Iniciar o servidor standalone
// No container, o server.js está na raiz porque copiamos .next/standalone para ./
try {
  require('./server.js');
} catch (e) {
  console.error('Error loading server.js:', e.message);
  console.error('Trying alternative path...');
  // Tentar caminho alternativo caso o server.js não esteja na raiz
  try {
    require('.next/standalone/server.js');
  } catch (e2) {
    console.error('Error loading .next/standalone/server.js:', e2.message);
    process.exit(1);
  }
}
