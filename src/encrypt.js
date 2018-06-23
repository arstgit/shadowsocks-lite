const crypto = require("crypto");
const util = require("util");

const bytes_to_key_results = {};

const EVP_BytesToKey = function(password, key_len, iv_len) {
  if (bytes_to_key_results[`${password}:${key_len}:${iv_len}`]) {
    return bytes_to_key_results[`${password}:${key_len}:${iv_len}`];
  }
  const m = [];
  let i = 0;
  let count = 0;
  while (count < key_len + iv_len) {
    const md5 = crypto.createHash("md5");
    let data = password;
    if (i > 0) {
      data = Buffer.concat([m[i - 1], password]);
    }
    md5.update(data);
    const d = md5.digest();
    m.push(d);
    count += d.length;
    i += 1;
  }
  const ms = Buffer.concat(m);
  const key = ms.slice(0, key_len);
  const iv = ms.slice(key_len, key_len + iv_len);
  bytes_to_key_results[password] = [key, iv];
  return [key, iv];
};

const method_supported = {
  "aes-256-cfb": [32, 16]
};

class Encryptor {
  constructor(key, method) {
    this.key = key;
    this.method = method;
    this.iv_sent = false;
    this.cipher = this.get_cipher(
      this.key,
      this.method,
      1,
      crypto.randomBytes(32)
    );
  }

  get_cipher_len(method) {
    method = method.toLowerCase();
    const m = method_supported[method];
    return m;
  }

  get_cipher(password, method, op, iv) {
    method = method.toLowerCase();
    password = Buffer.from(password, "binary");
    const m = this.get_cipher_len(method);
    const [key, iv_] = EVP_BytesToKey(password, m[0], m[1]);
    if (iv == null) {
      iv = iv_;
    }
    if (op === 1) {
      this.cipher_iv = iv.slice(0, m[1]);
    }
    iv = iv.slice(0, m[1]);
    if (op === 1) {
      return crypto.createCipheriv(method, key, iv);
    } else {
      return crypto.createDecipheriv(method, key, iv);
    }
  }

  encrypt(buf) {
    const result = this.cipher.update(buf);
    if (this.iv_sent) {
      return result;
    } else {
      this.iv_sent = true;
      return Buffer.concat([this.cipher_iv, result]);
    }
  }

  decrypt(buf) {
    let result;
    if (this.decipher == null) {
      const decipher_iv_len = this.get_cipher_len(this.method)[1];
      const decipher_iv = buf.slice(0, decipher_iv_len);
      this.decipher = this.get_cipher(this.key, this.method, 0, decipher_iv);
      result = this.decipher.update(buf.slice(decipher_iv_len));
      return result;
    } else {
      result = this.decipher.update(buf);
      return result;
    }
  }
}

const encryptAll = function(password, method, op, data) {
  let cipher, iv;
  const result = [];
  method = method.toLowerCase();
  const [keyLen, ivLen] = method_supported[method];
  password = Buffer.from(password, "binary");
  const [key, iv_] = EVP_BytesToKey(password, keyLen, ivLen);
  if (op === 1) {
    iv = crypto.randomBytes(ivLen);
    result.push(iv);
  } else {
    iv = data.slice(0, ivLen);
    data = data.slice(ivLen);
  }
  if (op === 1) {
    cipher = crypto.createCipheriv(method, key, iv);
  } else {
    cipher = crypto.createDecipheriv(method, key, iv);
  }
  result.push(cipher.update(data));
  result.push(cipher.final());
  return Buffer.concat(result);
};

exports.Encryptor = Encryptor;
exports.encryptAll = encryptAll;
