const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const src = fs.readFileSync("wallet-server.cjs", "utf8");
const start = src.indexOf("function parseSolToLamports(amount) {");
const end = src.indexOf("\n}", start);

assert(start >= 0 && end >= 0, "Dönüşüm fonksiyonu bulunamadı");

const parseSolToLamports = vm.runInNewContext(
  "(" + src.slice(start, end + 2) + ")"
);

const cases = [
  ["0.1", 100000000],
  ["1.000000001", 1000000001],
  ["0.000000001", 1],
  ["1", 1000000000],
  ["0", null],
  ["-1", null],
  ["0.0000000001", null],
  ["9999999", null],
  ["abc", null],
  ["1.123456789", 1123456789],
];

for (const [input, expected] of cases) {
  assert.strictEqual(
    parseSolToLamports(input),
    expected,
    `Beklenmeyen dönüşüm: ${input}`
  );
  console.log(`PASS: ${input}`);
}

console.log(`\n${cases.length}/${cases.length} tutar testi başarılı.`);
