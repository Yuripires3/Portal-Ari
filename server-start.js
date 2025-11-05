#!/usr/bin/env node

// Forçar o hostname a 0.0.0.0 antes de iniciar o servidor
process.env.HOSTNAME = '0.0.0.0';
process.env.HOST = '0.0.0.0';
process.env.PORT = process.env.PORT || '3005';

// Iniciar o servidor standalone
require('./server.js');

