"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const USERS_FILE = path.join(__dirname, "..", "users.json");

const PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

function loadAdmin() {
  const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));

  if (!Array.isArray(data.users)) {
    throw new Error("Kullanıcı veritabanı geçersiz.");
  }

  const admins = data.users.filter(
    user => user.role === "admin"
  );

  if (admins.length !== 1) {
    throw new Error("Tam olarak bir admin hesabı bulunmalı.");
  }

  return admins[0];
}

function verifyPassword(password, admin) {
  return new Promise(resolve => {
    if (
      typeof password !== "string" ||
      password.length < 1 ||
      password.length > 128 ||
      admin.passwordScheme !== "scrypt" ||
      !/^[a-f0-9]{32}$/i.test(admin.passwordSalt || "") ||
      !/^[a-f0-9]{128}$/i.test(admin.passwordHash || "")
    ) {
      return resolve(false);
    }

    const params = admin.passwordParams || {};

    if (
      params.N !== PARAMS.N ||
      params.r !== PARAMS.r ||
      params.p !== PARAMS.p ||
      params.keyLength !== 64
    ) {
      return resolve(false);
    }

    crypto.scrypt(
      password,
      Buffer.from(admin.passwordSalt, "hex"),
      64,
      PARAMS,
      (error, derivedKey) => {
        if (error) return resolve(false);

        const expected = Buffer.from(
          admin.passwordHash,
          "hex"
        );

        resolve(
          expected.length === derivedKey.length &&
          crypto.timingSafeEqual(expected, derivedKey)
        );
      }
    );
  });
}

module.exports = {
  loadAdmin,
  verifyPassword
};
