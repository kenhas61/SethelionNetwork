#!/bin/bash

set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"
PASS=0
FAIL=0

check_status() {
  local name="$1"
  local expected="$2"
  shift 2

  local actual
  actual=$(curl -sS -o /tmp/sethelion-api-test-body \
    -w '%{http_code}' "$@") || {
      echo "FAIL: $name (bağlantı hatası)"
      FAIL=$((FAIL + 1))
      return
    }

  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (beklenen $expected, alınan $actual)"
    cat /tmp/sethelion-api-test-body
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo "SethelionNetwork API smoke testleri"
echo

check_status "Cüzdan API" 200 \
  "$BASE/api/wallet"

check_status "İşlem geçmişi API" 200 \
  "$BASE/api/transactions?limit=10"

check_status "Geçersiz alıcı adresi reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"gecersiz-adres","amount":"0.1"}'

check_status "Sıfır transfer tutarı reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"0"}'

check_status "Negatif transfer tutarı reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"-1"}'

echo

check_status "Gönderimde geçersiz alıcı reddediliyor" 400 \
  -X POST "$BASE/api/transfer/send" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"gecersiz-adres","amount":"0.1"}'

check_status "Gönderimde sıfır tutar reddediliyor" 400 \
  -X POST "$BASE/api/transfer/send" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"0"}'

check_status "Gönderimde hatalı tutar reddediliyor" 400 \
  -X POST "$BASE/api/transfer/send" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"abc"}'


check_status "9 basamaktan fazla ondalık reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"0.0000000001"}'

check_status "Güvenli sınırı aşan tutar reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"9999999"}'

echo "Başarılı: $PASS"
echo "Başarısız: $FAIL"

rm -f /tmp/sethelion-api-test-body

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

echo "Tüm API smoke testleri başarılı."
