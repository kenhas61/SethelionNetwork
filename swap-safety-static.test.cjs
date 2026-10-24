const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(
  new URL('./wallet-server.cjs', `file://${__filename}`),
  'utf8'
);

test('Mainnet RPC ayrı yapılandırılmış', () => {
  assert.match(source, /SOLANA_MAINNET_RPC_URL/);
  assert.match(source, /api\.mainnet-beta\.solana\.com/);
});

test('Sunucu başlamadan Mainnet genesis hash doğrulanıyor', () => {
  assert.match(source, /await mainnetConnection\.getGenesisHash\(\)/);
  assert.match(source, /actualGenesis !== expectedGenesis/);
  assert.match(source, /Mainnet RPC doğrulanamadı; sunucu başlatılmadı/);
});

test('Execute öncesi pending durumu kalıcı kaydediliyor', () => {
  const start = source.indexOf('app.post("/api/swap/execute"');
  assert.notEqual(start, -1);

  const end = source.indexOf('// Mainnet RPC kimliği doğrulanmadan', start);
  const route = source.slice(start, end);

  const pending = route.indexOf('status: "pending"');
  const persist = route.indexOf('persistSwapStates()', pending);
  const execute = route.indexOf('https://api.jup.ag/swap/v2/execute');

  assert.ok(pending >= 0, 'pending kaydı bulunmalı');
  assert.ok(persist > pending, 'pending kaydı yürütmeden önce kaydedilmeli');
  assert.ok(execute > persist, 'Jupiter yürütmesi kayıttan sonra olmalı');
});

test('Aynı requestId ile tekrar yürütme engelleniyor', () => {
  assert.match(source, /activeSwapExecutions\.has\(requestId\)/);
  assert.match(source, /hasOwnProperty\.call\(swapStates, requestId\)/);
  assert.match(source, /doNotRetryAutomatically:\s*true/);
});

test('Jupiter Success tek başına başarı sayılmıyor', () => {
  assert.match(source, /mainnetConnection\.getTransaction\(signature/);
  assert.match(source, /tx\.meta\.err === null/);
  assert.match(
    source,
    /status === "Success" && signature !== null && chainConfirmed/
  );
});

test('RPC doğrulaması yapılamazsa işlem pending kalıyor', () => {
  assert.match(source, /let chainConfirmed = false/);
  assert.match(source, /status: confirmedSuccess\s*\?\s*"confirmed"\s*:\s*"pending"/);
  assert.match(source, /İşlem Mainnet üzerinde henüz doğrulanamadı/);
});

test('Durum kaydı atomik geçici dosya ve rename ile yazılıyor', () => {
  assert.match(source, /const tmp = SWAP_STATE_FILE \+ "\.tmp"/);
  assert.match(source, /fs\.renameSync\(tmp, SWAP_STATE_FILE\)/);
});

test('Durum sorgusu bulunamayan kayıtta otomatik tekrar önermiyor', () => {
  assert.match(source, /status: "not_found"/);
  assert.match(source, /Bu, işlemin gerçekleşmediğini kanıtlamaz/);
  assert.match(source, /doNotRetryAutomatically:\s*true/);
});
