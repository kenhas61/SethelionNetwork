#!/bin/bash

set -e

BASE="http://127.0.0.1:3000"

echo "1. Cüzdan API testi"
curl -sS "$BASE/api/wallet"
echo
echo

echo "2. İşlem geçmişi API testi"
curl -fsS "$BASE/api/transactions?limit=10"
echo
echo

echo "3. Geçersiz adres testi"
curl -sS -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"gecersiz-adres","amount":"0.1"}'
echo
echo

echo "4. Sıfır tutar testi"
curl -sS -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"0"}'
echo
echo

echo "Tüm API istekleri tamamlandı."
