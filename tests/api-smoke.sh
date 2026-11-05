#!/bin/bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"
PASS=0
FAIL=0
COOKIE_JAR=$(mktemp)
LOGIN_BODY=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$LOGIN_BODY"' EXIT

read -r -s -p "Admin parolası: " ADMIN_PASSWORD
echo
export SETHELION_TEST_PASSWORD="$ADMIN_PASSWORD"
unset ADMIN_PASSWORD

node -e 'process.stdout.write(JSON.stringify({
  username:"sethelionadmin",
  password:process.env.SETHELION_TEST_PASSWORD
}))' > "$LOGIN_BODY"
unset SETHELION_TEST_PASSWORD

LOGIN_STATUS=$(curl -sS -c "$COOKIE_JAR" -o /dev/null \
  -w '%{http_code}' -H 'Content-Type: application/json' \
  --data-binary @"$LOGIN_BODY" "$BASE/api/auth/login")

rm -f "$LOGIN_BODY"

if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "FAIL: Admin girişi (HTTP $LOGIN_STATUS)"
  exit 1
fi
echo "PASS: Admin girişi (HTTP 200)"

TMP_DIR=$(mktemp -d)
COOKIE_JAR="$TMP_DIR/cookies"
LOGIN_BODY="$TMP_DIR/login.json"
LOGIN_RESPONSE="$TMP_DIR/login-response"

trap 'rm -rf "$TMP_DIR"' EXIT

echo "SethelionNetwork API smoke testleri"
echo

read -r -p "Admin kullanıcı adı: " TEST_USERNAME
read -r -s -p "Admin parolası: " TEST_PASSWORD
echo

export TEST_USERNAME TEST_PASSWORD

node -e '
process.stdout.write(JSON.stringify({
  username: process.env.TEST_USERNAME,
  password: process.env.TEST_PASSWORD
}));
' > "$LOGIN_BODY"

unset TEST_PASSWORD

echo "Admin oturumu doğrulanıyor..."

LOGIN_STATUS=$(curl -sS \
  -o "$LOGIN_RESPONSE" \
  -w '%{http_code}' \
  -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  --data-binary @"$LOGIN_BODY" \
  "$BASE/api/auth/login")

rm -f "$LOGIN_BODY"

if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "FAIL: Admin girişi (HTTP $LOGIN_STATUS)"
  cat "$LOGIN_RESPONSE"
  exit 1
fi

echo "PASS: Admin oturumu oluşturuldu"

check_status() {
  local name="$1"
  local expected="$2"
  shift 2

  local actual

  actual=$(curl -sS \
    -o "$TMP_DIR/body" \
    -w '%{http_code}' \
    -b "$COOKIE_JAR" "$@") || {
      echo "FAIL: $name (bağlantı hatası)"
      FAIL=$((FAIL + 1))
      return
    }

  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name (beklenen $expected, alınan $actual)"
    cat "$TMP_DIR/body"
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo
echo "Yetkili API testleri"

check_status "Cüzdan API" 200 \
  "$BASE/api/wallet"

check_status "İşlem geçmişi API" 200 \
  "$BASE/api/transactions?limit=10"

check_status "Geçersiz alıcı reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"gecersiz-adres","amount":"0.1"}'

check_status "Sıfır transfer reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"0"}'

check_status "Negatif transfer reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"-1"}'

check_status "Gönderimde geçersiz alıcı reddediliyor" 400 \
  -X POST "$BASE/api/transfer/send" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"gecersiz-adres","amount":"0.1"}'

check_status "Gönderimde sıfır tutar reddediliyor" 400 \
  -X POST "$BASE/api/transfer/send" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"0"}'

check_status "Hatalı tutar reddediliyor" 400 \
  -X POST "$BASE/api/transfer/send" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"abc"}'

check_status "Fazla ondalık basamak reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"0.0000000001"}'

check_status "Güvenli sınırı aşan tutar reddediliyor" 400 \
  -X POST "$BASE/api/transfer/preview" \
  -H 'Content-Type: application/json' \
  -d '{"recipient":"11111111111111111111111111111111","amount":"9999999"}'

check_status "Geçersiz requestId reddediliyor" 400 \
  --get "$BASE/api/transfer/status" \
  --data-urlencode "requestId=invalid"

check_status "Bilinmeyen transfer güvenli yanıt veriyor" 404 \
  --get "$BASE/api/transfer/status" \
  --data-urlencode "requestId=00000000-0000-4000-8000-000000000001"

echo
echo "Yetkisiz erişim testi"

UNAUTH_STATUS=$(curl -sS -o "$TMP_DIR/unauth" \
  -w '%{http_code}' "$BASE/api/wallet")

if [[ "$UNAUTH_STATUS" == "401" ]]; then
  echo "PASS: Oturumsuz API erişimi engellendi"
  PASS=$((PASS + 1))
else
  echo "FAIL: Oturumsuz erişim HTTP $UNAUTH_STATUS"
  FAIL=$((FAIL + 1))
fi

echo
echo "Logout testi"

LOGOUT_STATUS=$(curl -sS \
  -o "$TMP_DIR/logout" \
  -w '%{http_code}' \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/logout")

if [[ "$LOGOUT_STATUS" == "200" ]]; then
  echo "PASS: Admin oturumu kapatıldı"
  PASS=$((PASS + 1))
else
  echo "FAIL: Logout HTTP $LOGOUT_STATUS"
  FAIL=$((FAIL + 1))
fi

AFTER_LOGOUT=$(curl -sS -o "$TMP_DIR/after-logout" \
  -w '%{http_code}' \
  -b "$COOKIE_JAR" "$BASE/api/wallet")

if [[ "$AFTER_LOGOUT" == "401" ]]; then
  echo "PASS: Logout sonrası API erişimi engellendi"
  PASS=$((PASS + 1))
else
  echo "FAIL: Logout sonrası HTTP $AFTER_LOGOUT"
  FAIL=$((FAIL + 1))
fi

echo
echo "Başarılı: $PASS"
echo "Başarısız: $FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi

echo "Tüm API smoke testleri başarılı."
