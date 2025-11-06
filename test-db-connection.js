#!/usr/bin/env node

/**
 * Script de teste de conexão MySQL
 * Execute: node test-db-connection.js
 */

const mysql = require('mysql2/promise');

async function testConnection() {
  const config = {
    host: process.env.DB_HOST || '201.76.177.134',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'Indicadores',
    password: process.env.DB_PASSWORD || 'xEth+vOHltr*c4Eju3+t',
    database: process.env.DB_NAME || 'indicadores',
    connectTimeout: 10000, // 10 segundos
  };

  console.log('🔍 Testando conexão MySQL...');
  console.log('📋 Configuração:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   User: ${config.user}`);
  console.log(`   Database: ${config.database}`);
  console.log('');

  try {
    console.log('⏳ Tentando conectar...');
    const connection = await mysql.createConnection(config);
    console.log('✅ Conexão estabelecida com sucesso!');
    
    // Testar query simples
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Query de teste executada:', rows);
    
    // Verificar se consegue acessar a tabela de usuários
    try {
      const [users] = await connection.execute('SHOW TABLES LIKE "usuarios"');
      if (users.length > 0) {
        console.log('✅ Tabela "usuarios" encontrada');
      } else {
        console.log('⚠️  Tabela "usuarios" não encontrada');
      }
    } catch (e) {
      console.log('⚠️  Erro ao verificar tabelas:', e.message);
    }
    
    await connection.end();
    console.log('✅ Conexão fechada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao conectar:');
    console.error(`   Code: ${error.code}`);
    console.error(`   Errno: ${error.errno}`);
    console.error(`   Message: ${error.message}`);
    console.error('');
    
    if (error.code === 'ETIMEDOUT') {
      console.error('🔍 Diagnóstico:');
      console.error('   - O servidor MySQL não está respondendo');
      console.error('   - Verifique se o IP está correto:', config.host);
      console.error('   - Verifique se a porta está aberta:', config.port);
      console.error('   - Verifique se o MySQL aceita conexões remotas');
      console.error('   - Verifique firewall do servidor MySQL');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔍 Diagnóstico:');
      console.error('   - Conexão recusada pelo servidor');
      console.error('   - MySQL pode não estar rodando');
      console.error('   - Porta pode estar bloqueada por firewall');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('🔍 Diagnóstico:');
      console.error('   - Credenciais incorretas');
      console.error('   - Verifique usuário e senha');
    }
    
    process.exit(1);
  }
}

testConnection();

