const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('wallet-server.cjs', 'utf8');

test('Transfer requestId doğrulanıyor', () => {
  assert.match(source, /Geçerli bir transfer requestId gerekli/);
});

test('Aynı requestId tekrar kullanılamıyor', () => {
  assert.match(source, /hasOwnProperty\.call\(transferStates, requestId\)/);
});

test('Eşzamanlı transfer requestId kilidi var', () => {
  assert.match(source, /activeTransferExecutions\.has\(requestId\)/);
  assert.match(source, /activeTransferExecutions\.add\(requestId\)/);
  assert.match(source, /activeTransferExecutions\.delete\(requestId\)/);
});

test('İmza gönderimden önce kalıcı kaydediliyor', () => {
  const start = source.indexOf('app.post("/api/transfer/send"');
  const end = source.indexOf('app.get("/api/transactions"', start);
  const route = source.slice(start, end);
  assert.ok(route.indexOf('persistTransferStates()') < route.indexOf('connection.sendRawTransaction'));
});
