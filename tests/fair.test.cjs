// Тесты provably fair: node tests/fair.test.cjs
const assert = require('assert');
const crypto = require('crypto');
global.window = global;
global.App = { state: {}, save() {}, uid: () => Math.random().toString(36).slice(2) };
require('../js/fair.js');
const F = App.fair;

// эталонный вектор Stake / lucasholder/fair
assert.strictEqual(F.float('some server seed', 'some client seed', 1, 0), 0.5919261889066547);
assert.strictEqual(F.float('some server seed', 'some client seed', 1, 1), 0.81884371698834);
assert.strictEqual(F.float('some server seed', 'some client seed', 1, 2), 0.17176169087179005);
assert.strictEqual(F.float('some server seed', 'some client seed', 1, 3), 0.277875404804945);
// HMAC совпадает с Node на разных длинах ключа и сообщения, включая кириллицу
for (let i = 0; i < 2000; i++) {
  const k = crypto.randomBytes(i % 90).toString('hex') + (i % 7 ? '' : 'сид');
  const m = `клиент${i}:${i}:${i % 3}` + 'x'.repeat(i % 130);
  assert.strictEqual(F.hmacHex(k, m), crypto.createHmac('sha256', k).update(m).digest('hex'));
}
assert.strictEqual(F.hmacHex('a3f1c2e4b5d6978812345678deadbeefcafebabe0123456789abcdef01234567', 'my_client_seed:0:0').slice(0, 13), '1a76e75f524ce');
// билеты 1…100000 и равномерность
assert.strictEqual(F.ticket(0), 1);
assert.strictEqual(F.ticket(0.9999999999), 100000);
// смена сидов раскрывает прошлый seed, хэш совпадает
const g = F.begin('case');
const before = g.proof.serverHash;
const rev = F.rotate();
assert.strictEqual(rev.serverHash, before);
assert.strictEqual(F.sha256Hex(rev.serverSeed), before);
// следующий seed был зафиксирован заранее
const { nextHash } = F.current();
const rev2 = F.rotate();
assert.strictEqual(F.current().serverHash, nextHash);
assert.ok(rev2);
console.log('fair: все тесты прошли');
