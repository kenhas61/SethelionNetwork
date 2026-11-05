const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const USERS_FILE = path.join(__dirname, "..", "users.json");

const PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

async function main() {
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 14 || password.length > 128) {
    throw new Error("Parola 14-128 karakter arasında olmalı.");
  }

  const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));

  const admins = data.users.filter(u => u.role === "admin");

  if (admins.length !== 1) {
    throw new Error("Tam olarak bir admin hesabı bulunmalı.");
  }

  const salt = crypto.randomBytes(16);

  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, PARAMS, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  const admin = admins[0];

  admin.passwordScheme = "scrypt";
  admin.passwordSalt = salt.toString("hex");
  admin.passwordHash = hash.toString("hex");
  admin.passwordParams = {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    keyLength: 64
  };

  const temp = USERS_FILE + "." + process.pid + ".tmp";
  const fd = fs.openSync(temp, "wx", 0o600);

  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(temp, USERS_FILE);
  fs.chmodSync(USERS_FILE, 0o600);

  console.log("Admin parolası güvenli biçimde yenilendi.");
  console.log("Kullanıcı:", admin.username);
  console.log("Scrypt N:", PARAMS.N);
  console.log("Hash uzunluğu:", hash.length);
  console.log("Dosya izinleri: 600");
}

main().catch(error => {
  console.error("Parola yenileme başarısız:", error.message);
  process.exitCode = 1;
});
