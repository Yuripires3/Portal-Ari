#!/usr/bin/env node

// Forçar o hostname a 0.0.0.0 antes de iniciar o servidor
process.env.HOSTNAME = '0.0.0.0';
process.env.HOST = '0.0.0.0';
process.env.PORT = process.env.PORT || '3005';

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

