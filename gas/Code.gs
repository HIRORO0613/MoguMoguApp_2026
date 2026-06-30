/**
 * MoguMogu Backend — Google Apps Script
 * 仕様: MoguMogu_Requirements_v6.md
 *
 * Script Properties (環境変数):
 *   SPREADSHEET_ID  — データ用スプレッドシート ID
 *   JWT_SECRET      — JWT 署名鍵
 *   APP_SECRET_KEY  — EncryptedData 難読化鍵（フロントと同一値）
 */

// =============================================================================
// 定数
// =============================================================================

var CONFIG = {
  TIMEZONE: 'Asia/Tokyo',
  JWT_EXPIRY_DAYS: 30,
  JWT_REFRESH_THRESHOLD_DAYS: 7,
  PBKDF2_ITERATIONS: 100000,
  PBKDF2_SALT_BYTES: 16,
  PBKDF2_HASH_BYTES: 32,
  LOGIN_ID_MIN: 3,
  LOGIN_ID_MAX: 32,
  LOGIN_ID_PATTERN: /^[a-z0-9_]+$/,
  MAX_QUERY_DAYS: 365,
  CHAT_LOG_MAX_PER_USER: 100,
  SHEETS: {
    USERS: 'Users',
    PROFILES: 'Profiles',
    MEALS: 'Meals',
    EXERCISES: 'Exercises',
    WEIGHTS: 'Weights',
    CHAT_LOGS: 'ChatLogs',
    DAILY_SUMMARIES: 'DailySummaries'
  }
};

// =============================================================================
// エントリーポイント
// =============================================================================

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function doPut(e) {
  return handleRequest(e, 'PUT');
}

function doDelete(e) {
  return handleRequest(e, 'DELETE');
}

// =============================================================================
// ルーター
// =============================================================================

function handleRequest(e, method) {
  try {
    var path = resolvePath_(e);
    var body = parseBody_(e);

    // PUT / DELETE はブラウザ CORS preflight 回避のため POST + _method でトンネリング
    if (method === 'POST' && body && body._method) {
      var override = String(body._method).toUpperCase();
      if (override === 'PUT' || override === 'DELETE') {
        method = override;
      }
    }

    if (method === 'GET' && path === '/api/dashboard') {
      return jsonResponse(handleDashboard_(e, requireAuth_(e)));
    }
    if (method === 'GET' && path === '/api/summary') {
      return jsonResponse(handleGetSummary_(e, requireAuth_(e)));
    }
    if (method === 'GET' && path === '/api/profile') {
      return jsonResponse(handleGetProfile_(requireAuth_(e)));
    }
    if (method === 'PUT' && path === '/api/profile') {
      return jsonResponse(handlePutProfile_(requireAuth_(e), body));
    }
    if (method === 'GET' && path === '/api/meals') {
      return jsonResponse(handleGetMeals_(e, requireAuth_(e)));
    }
    if (method === 'POST' && path === '/api/meals') {
      return jsonResponse(handlePostMeals_(requireAuth_(e), body));
    }
    if (method === 'GET' && path === '/api/weights') {
      return jsonResponse(handleGetWeights_(e, requireAuth_(e)));
    }
    if (method === 'POST' && path === '/api/weights') {
      return jsonResponse(handlePostWeights_(requireAuth_(e), body));
    }
    if (method === 'GET' && path === '/api/exercises') {
      return jsonResponse(handleGetExercises_(e, requireAuth_(e)));
    }
    if (method === 'POST' && path === '/api/exercises') {
      return jsonResponse(handlePostExercises_(requireAuth_(e), body));
    }

    if (method === 'POST' && path === '/api/auth/register') {
      return jsonResponse(handleRegister_(body));
    }
    if (method === 'POST' && path === '/api/auth/login') {
      return jsonResponse(handleLogin_(body));
    }
    if (method === 'POST' && path === '/api/auth/refresh') {
      return jsonResponse(handleRefresh_(requireAuth_(e)));
    }
    if (method === 'POST' && path === '/api/auth/change-password') {
      return jsonResponse(handleChangePassword_(requireAuth_(e), body));
    }
    if (method === 'POST' && path === '/api/chat') {
      return jsonResponse(handlePostChat_(requireAuth_(e), body));
    }
    if (method === 'POST' && path === '/api/webhook') {
      return jsonResponse(handleWebhook_(body, e));
    }
    if (method === 'DELETE' && path === '/api/account') {
      return jsonResponse(handleDeleteAccount_(requireAuth_(e), body));
    }

    return jsonResponse({ error: 'Not Found', path: path, method: method }, 404);
  } catch (err) {
    var status = err.status || 500;
    return jsonResponse({ error: err.message || String(err) }, status);
  }
}

function resolvePath_(e) {
  if (e && e.pathInfo) {
    var p = String(e.pathInfo);
    if (p.charAt(0) !== '/') p = '/' + p;
    return p.replace(/\/+$/, '') || '/';
  }
  if (e && e.parameter && e.parameter.path) {
    var q = String(e.parameter.path);
    if (q.charAt(0) !== '/') q = '/' + q;
    return q.replace(/\/+$/, '') || '/';
  }
  return '/';
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (parseErr) {
    throw httpError_(400, 'Invalid JSON body');
  }
}

// =============================================================================
// HTTP レスポンス / エラー
// =============================================================================

function jsonResponse(data, status) {
  status = status || 200;
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function httpError_(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
}

// =============================================================================
// 環境変数
// =============================================================================

function getProp_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw httpError_(500, 'Missing Script Property: ' + key);
  return value;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getProp_('SPREADSHEET_ID'));
}

function getJwtSecret_() {
  return getProp_('JWT_SECRET');
}

function getAppSecretKey_() {
  return getProp_('APP_SECRET_KEY');
}

// =============================================================================
// JWT 発行 / 検証
// =============================================================================

function issueJwt_(userUUID, loginId, tokenVersion) {
  var now = Math.floor(Date.now() / 1000);
  var payload = {
    sub: userUUID,
    loginId: loginId,
    tokenVersion: tokenVersion,
    iat: now,
    exp: now + CONFIG.JWT_EXPIRY_DAYS * 24 * 60 * 60
  };
  return signJwt_(payload);
}

function signJwt_(payload) {
  var header = { alg: 'HS256', typ: 'JWT' };
  var encodedHeader = base64UrlEncode_(JSON.stringify(header));
  var encodedPayload = base64UrlEncode_(JSON.stringify(payload));
  var signingInput = encodedHeader + '.' + encodedPayload;
  var signature = Utilities.computeHmacSha256Signature(signingInput, getJwtSecret_());
  return signingInput + '.' + base64UrlEncodeBytes_(signature);
}

function verifyJwt_(token) {
  if (!token) throw httpError_(401, 'Missing token');
  var parts = String(token).split('.');
  if (parts.length !== 3) throw httpError_(401, 'Invalid token format');

  var signingInput = parts[0] + '.' + parts[1];
  var expected = Utilities.computeHmacSha256Signature(signingInput, getJwtSecret_());
  var actual = base64UrlDecodeToBytes_(parts[2]);
  if (!constantTimeEqual_(expected, actual)) {
    throw httpError_(401, 'Invalid token signature');
  }

  var payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(base64UrlToStandard_(parts[1]))).getDataAsString());
  var now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw httpError_(401, 'Token expired');
  }
  return payload;
}

function getBearerToken_(e) {
  // 1) Authorization ヘッダー（標準）
  if (e && e.headers) {
    var auth = e.headers.Authorization || e.headers.authorization;
    if (auth) {
      var match = String(auth).match(/^Bearer\s+(.+)$/i);
      if (match) return match[1];
    }
  }
  // 2) クエリパラメータ ?token= (CORS preflight 回避)
  if (e && e.parameter && e.parameter.token) {
    return String(e.parameter.token);
  }
  return null;
}

function requireAuth_(e) {
  var token = getBearerToken_(e);
  // 3) POST body 内の token フィールド (フォールバック)
  if (!token) {
    try {
      var body = parseBody_(e);
      if (body && body.token) token = String(body.token);
    } catch (err) { /* ignore */ }
  }
  var payload = verifyJwt_(token);
  var user = findUserByUUID_(payload.sub);
  if (!user) throw httpError_(401, 'User not found');
  if (Number(user.tokenVersion) !== Number(payload.tokenVersion)) {
    throw httpError_(401, 'Token revoked');
  }
  return {
    userUUID: user.userUUID,
    loginId: user.loginId,
    tokenVersion: Number(user.tokenVersion),
    webhookToken: user.webhookToken,
    jwtPayload: payload
  };
}

function getJwtRemainingDays_(payload) {
  var now = Math.floor(Date.now() / 1000);
  return (payload.exp - now) / (24 * 60 * 60);
}

// =============================================================================
// PBKDF2-HMAC-SHA256
// =============================================================================

function hashPassword_(password, saltBytes) {
  var dk = pbkdf2Sha256_(password, saltBytes, CONFIG.PBKDF2_ITERATIONS, CONFIG.PBKDF2_HASH_BYTES);
  return bytesToHex_(dk);
}

function verifyPassword_(password, saltHex, hashHex) {
  var saltBytes = hexToBytes_(saltHex);
  var computed = hashPassword_(password, saltBytes);
  return constantTimeEqualStr_(computed, hashHex);
}

function pbkdf2Sha256_(password, saltBytes, iterations, dkLen) {
  var passwordBytes = stringToUtf8Bytes_(password);
  var hLen = 32;
  var blocks = Math.ceil(dkLen / hLen);
  var result = [];

  for (var i = 1; i <= blocks; i++) {
    var block = pbkdf2Block_(passwordBytes, saltBytes, iterations, i);
    for (var j = 0; j < block.length; j++) {
      result.push(block[j]);
    }
  }
  return result.slice(0, dkLen);
}

function pbkdf2Block_(passwordBytes, saltBytes, iterations, blockIndex) {
  var blockBytes = [
    (blockIndex >>> 24) & 0xff,
    (blockIndex >>> 16) & 0xff,
    (blockIndex >>> 8) & 0xff,
    blockIndex & 0xff
  ];
  var saltBlock = saltBytes.concat(blockBytes);
  var u = hmacSha256Bytes_(passwordBytes, saltBlock);
  var result = u.slice();

  for (var i = 1; i < iterations; i++) {
    u = hmacSha256Bytes_(passwordBytes, u);
    for (var j = 0; j < result.length; j++) {
      result[j] ^= u[j];
    }
  }
  return result;
}

function hmacSha256Bytes_(keyBytes, messageBytes) {
  var blockSize = 64;
  if (keyBytes.length > blockSize) {
    keyBytes = sha256Bytes_(keyBytes);
  }
  while (keyBytes.length < blockSize) {
    keyBytes.push(0);
  }
  var oKeyPad = [];
  var iKeyPad = [];
  for (var i = 0; i < blockSize; i++) {
    oKeyPad.push(keyBytes[i] ^ 0x5c);
    iKeyPad.push(keyBytes[i] ^ 0x36);
  }
  var inner = sha256Bytes_(iKeyPad.concat(messageBytes));
  return sha256Bytes_(oKeyPad.concat(inner));
}

function sha256Bytes_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var out = [];
  for (var i = 0; i < digest.length; i++) {
    out.push(digest[i] < 0 ? digest[i] + 256 : digest[i]);
  }
  return out;
}

// =============================================================================
// 難読化暗号 (AES-256-CBC, IV 16byte 前置)
// =============================================================================

function encryptData_(obj) {
  var plaintext = JSON.stringify(obj);
  var key = sha256Bytes_(stringToUtf8Bytes_(getAppSecretKey_()));
  var iv = randomBytes_(16);
  var plainBytes = stringToUtf8Bytes_(plaintext);
  var padded = pkcs7Pad_(plainBytes, 16);
  var cipherBytes = aes256CbcEncrypt_(padded, key, iv);
  return Utilities.base64Encode(iv.concat(cipherBytes));
}

function decryptData_(encryptedBase64) {
  if (!encryptedBase64) return null;
  var allBytes = Utilities.base64Decode(encryptedBase64);
  var bytes = [];
  for (var i = 0; i < allBytes.length; i++) {
    bytes.push(allBytes[i] < 0 ? allBytes[i] + 256 : allBytes[i]);
  }
  if (bytes.length <= 16) throw httpError_(500, 'Invalid encrypted data');
  var iv = bytes.slice(0, 16);
  var cipherBytes = bytes.slice(16);
  var key = sha256Bytes_(stringToUtf8Bytes_(getAppSecretKey_()));
  var plainBytes = aes256CbcDecrypt_(cipherBytes, key, iv);
  var unpadded = pkcs7Unpad_(plainBytes);
  return JSON.parse(bytesToStringUtf8_(unpadded));
}

function pkcs7Pad_(data, blockSize) {
  var pad = blockSize - (data.length % blockSize);
  var out = data.slice();
  for (var i = 0; i < pad; i++) {
    out.push(pad);
  }
  return out;
}

function pkcs7Unpad_(data) {
  if (!data.length) throw httpError_(500, 'Invalid padding');
  var pad = data[data.length - 1];
  if (pad < 1 || pad > 16) throw httpError_(500, 'Invalid padding');
  for (var i = data.length - pad; i < data.length; i++) {
    if (data[i] !== pad) throw httpError_(500, 'Invalid padding');
  }
  return data.slice(0, data.length - pad);
}

function aes256CbcEncrypt_(plainBytes, keyBytes, ivBytes) {
  var expandedKey = aesKeyExpansion_(keyBytes);
  var prev = ivBytes.slice();
  var out = [];
  for (var offset = 0; offset < plainBytes.length; offset += 16) {
    var block = plainBytes.slice(offset, offset + 16);
    var xored = xorBytes_(block, prev);
    var encrypted = aesEncryptBlock_(xored, expandedKey);
    out = out.concat(encrypted);
    prev = encrypted;
  }
  return out;
}

function aes256CbcDecrypt_(cipherBytes, keyBytes, ivBytes) {
  var expandedKey = aesKeyExpansion_(keyBytes);
  var prev = ivBytes.slice();
  var out = [];
  for (var offset = 0; offset < cipherBytes.length; offset += 16) {
    var block = cipherBytes.slice(offset, offset + 16);
    var decrypted = aesDecryptBlock_(block, expandedKey);
    out = out.concat(xorBytes_(decrypted, prev));
    prev = block;
  }
  return out;
}

function xorBytes_(a, b) {
  var out = [];
  for (var i = 0; i < a.length; i++) {
    out.push(a[i] ^ b[i]);
  }
  return out;
}

function aesEncryptBlock_(input, w) {
  var state = bytesToState_(input);
  aesAddRoundKey_(state, w, 0);
  for (var round = 1; round < 14; round++) {
    aesSubBytes_(state);
    aesShiftRows_(state);
    aesMixColumns_(state);
    aesAddRoundKey_(state, w, round);
  }
  aesSubBytes_(state);
  aesShiftRows_(state);
  aesAddRoundKey_(state, w, 14);
  return stateToBytes_(state);
}

function aesDecryptBlock_(input, w) {
  var state = bytesToState_(input);
  aesAddRoundKey_(state, w, 14);
  for (var round = 13; round >= 1; round--) {
    aesInvShiftRows_(state);
    aesInvSubBytes_(state);
    aesAddRoundKey_(state, w, round);
    aesInvMixColumns_(state);
  }
  aesInvShiftRows_(state);
  aesInvSubBytes_(state);
  aesAddRoundKey_(state, w, 0);
  return stateToBytes_(state);
}

var AES_SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
];

var AES_RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];

function aesSubBytes_(state) {
  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      state[r][c] = AES_SBOX[state[r][c]];
    }
  }
}

function aesInvSubBytes_(state) {
  for (var r = 0; r < 4; r++) {
    for (var c = 0; c < 4; c++) {
      state[r][c] = AES_INV_SBOX[state[r][c]];
    }
  }
}

var AES_INV_SBOX = [
  0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
  0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
  0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
  0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
  0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
  0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
  0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
  0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
  0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
  0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
  0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
  0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
  0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
  0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
  0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
  0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d
];

function aesShiftRows_(state) {
  var t;
  t = state[1][0]; state[1][0] = state[1][1]; state[1][1] = state[1][2]; state[1][2] = state[1][3]; state[1][3] = t;
  t = state[2][0]; state[2][0] = state[2][2]; state[2][2] = t; t = state[2][1]; state[2][1] = state[2][3]; state[2][3] = t;
  t = state[3][3]; state[3][3] = state[3][2]; state[3][2] = state[3][1]; state[3][1] = state[3][0]; state[3][0] = t;
}

function aesInvShiftRows_(state) {
  var t;
  t = state[1][3]; state[1][3] = state[1][2]; state[1][2] = state[1][1]; state[1][1] = state[1][0]; state[1][0] = t;
  t = state[2][0]; state[2][0] = state[2][2]; state[2][2] = t; t = state[2][1]; state[2][1] = state[2][3]; state[2][3] = t;
  t = state[3][0]; state[3][0] = state[3][1]; state[3][1] = state[3][2]; state[3][2] = state[3][3]; state[3][3] = t;
}

function aesGmul_(a, b) {
  var p = 0;
  for (var i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    var hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>>= 1;
  }
  return p;
}

function aesMixColumns_(state) {
  for (var c = 0; c < 4; c++) {
    var s0 = state[0][c], s1 = state[1][c], s2 = state[2][c], s3 = state[3][c];
    state[0][c] = aesGmul_(0x02, s0) ^ aesGmul_(0x03, s1) ^ s2 ^ s3;
    state[1][c] = s0 ^ aesGmul_(0x02, s1) ^ aesGmul_(0x03, s2) ^ s3;
    state[2][c] = s0 ^ s1 ^ aesGmul_(0x02, s2) ^ aesGmul_(0x03, s3);
    state[3][c] = aesGmul_(0x03, s0) ^ s1 ^ s2 ^ aesGmul_(0x02, s3);
  }
}

function aesInvMixColumns_(state) {
  for (var c = 0; c < 4; c++) {
    var s0 = state[0][c], s1 = state[1][c], s2 = state[2][c], s3 = state[3][c];
    state[0][c] = aesGmul_(0x0e, s0) ^ aesGmul_(0x0b, s1) ^ aesGmul_(0x0d, s2) ^ aesGmul_(0x09, s3);
    state[1][c] = aesGmul_(0x09, s0) ^ aesGmul_(0x0e, s1) ^ aesGmul_(0x0b, s2) ^ aesGmul_(0x0d, s3);
    state[2][c] = aesGmul_(0x0d, s0) ^ aesGmul_(0x09, s1) ^ aesGmul_(0x0e, s2) ^ aesGmul_(0x0b, s3);
    state[3][c] = aesGmul_(0x0b, s0) ^ aesGmul_(0x0d, s1) ^ aesGmul_(0x09, s2) ^ aesGmul_(0x0e, s3);
  }
}

function aesAddRoundKey_(state, w, round) {
  for (var c = 0; c < 4; c++) {
    for (var r = 0; r < 4; r++) {
      state[r][c] ^= w[round * 4 + c][r];
    }
  }
}

function aesKeyExpansion_(keyBytes) {
  var nk = 8;
  var nr = 14;
  var w = [];
  for (var i = 0; i < nk; i++) {
    w[i] = [keyBytes[4 * i], keyBytes[4 * i + 1], keyBytes[4 * i + 2], keyBytes[4 * i + 3]];
  }
  for (i = nk; i < 4 * (nr + 1); i++) {
    var temp = w[i - 1].slice();
    if (i % nk === 0) {
      temp = [AES_SBOX[temp[1]] ^ AES_RCON[i / nk], AES_SBOX[temp[2]], AES_SBOX[temp[3]], AES_SBOX[temp[0]]];
    } else if (nk > 6 && i % nk === 4) {
      temp = [AES_SBOX[temp[0]], AES_SBOX[temp[1]], AES_SBOX[temp[2]], AES_SBOX[temp[3]]];
    }
    w[i] = [
      w[i - nk][0] ^ temp[0],
      w[i - nk][1] ^ temp[1],
      w[i - nk][2] ^ temp[2],
      w[i - nk][3] ^ temp[3]
    ];
  }
  // w[0..59]: flat array of 60 four-byte words.
  // aesAddRoundKey_ accesses w[round*4+c] so return the flat array directly.
  return w;
}

function bytesToState_(bytes) {
  var state = [[], [], [], []];
  for (var c = 0; c < 4; c++) {
    for (var r = 0; r < 4; r++) {
      state[r][c] = bytes[c * 4 + r];
    }
  }
  return state;
}

function stateToBytes_(state) {
  var bytes = [];
  for (var c = 0; c < 4; c++) {
    for (var r = 0; r < 4; r++) {
      bytes.push(state[r][c]);
    }
  }
  return bytes;
}

// =============================================================================
// ユーティリティ
// =============================================================================

function generateUUID_() {
  return Utilities.getUuid();
}

function normalizeLoginId_(loginId) {
  if (loginId == null) return '';
  return String(loginId).toLowerCase();
}

function validateLoginId_(loginId) {
  var normalized = normalizeLoginId_(loginId);
  if (normalized.length < CONFIG.LOGIN_ID_MIN || normalized.length > CONFIG.LOGIN_ID_MAX) {
    throw httpError_(400, 'LoginID must be 3-32 characters');
  }
  if (!CONFIG.LOGIN_ID_PATTERN.test(normalized)) {
    throw httpError_(400, 'LoginID allows only a-z, 0-9, and underscore');
  }
  return normalized;
}

function validatePassword_(password) {
  if (!password || String(password).length < 8) {
    throw httpError_(400, 'Password must be at least 8 characters');
  }
}

function randomBytes_(length) {
  var bytes = [];
  for (var i = 0; i < length; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return bytes;
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var h = (b & 0xff).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
}

function hexToBytes_(hex) {
  var bytes = [];
  for (var i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function stringToUtf8Bytes_(str) {
  return Utilities.newBlob(String(str)).getBytes().map(function (b) {
    return b < 0 ? b + 256 : b;
  });
}

function bytesToStringUtf8_(bytes) {
  var signed = bytes.map(function (b) {
    return b > 127 ? b - 256 : b;
  });
  return Utilities.newBlob(signed).getDataAsString();
}

function base64UrlEncode_(str) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(str).getBytes()).replace(/=+$/, '');
}

function base64UrlEncodeBytes_(bytes) {
  var signed = bytes.map(function (b) {
    return b > 127 ? b - 256 : b;
  });
  return Utilities.base64EncodeWebSafe(signed).replace(/=+$/, '');
}

function base64UrlToStandard_(input) {
  var s = String(input).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
}

function base64UrlDecodeToBytes_(input) {
  var decoded = Utilities.base64Decode(base64UrlToStandard_(input));
  var out = [];
  for (var i = 0; i < decoded.length; i++) {
    out.push(decoded[i] < 0 ? decoded[i] + 256 : decoded[i]);
  }
  return out;
}

function constantTimeEqual_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= (a[i] < 0 ? a[i] + 256 : a[i]) ^ (b[i] < 0 ? b[i] + 256 : b[i]);
  }
  return diff === 0;
}

function constantTimeEqualStr_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function parseDateParam_(value, name) {
  if (!value) throw httpError_(400, name + ' is required');
  var d = new Date(String(value));
  if (isNaN(d.getTime())) throw httpError_(400, 'Invalid ' + name);
  return d;
}

function validateDateRange_(startDate, endDate) {
  if (endDate < startDate) throw httpError_(400, 'end_date must be on or after start_date');
  var diffMs = endDate.getTime() - startDate.getTime();
  var diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays > CONFIG.MAX_QUERY_DAYS) {
    throw httpError_(400, 'Date range must not exceed ' + CONFIG.MAX_QUERY_DAYS + ' days');
  }
}

function getDateRangeFromRequest_(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var startDate = parseDateParam_(params.start_date, 'start_date');
  var endDate = parseDateParam_(params.end_date, 'end_date');
  validateDateRange_(startDate, endDate);
  return { startDate: startDate, endDate: endDate };
}

function toTokyoDateKey_(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function toTokyoDayStart_(dateKey) {
  return new Date(dateKey + 'T00:00:00+09:00');
}

function toTokyoDayEnd_(dateKey) {
  return new Date(dateKey + 'T23:59:59+09:00');
}

function parseTimestamp_(value) {
  if (!value) throw httpError_(400, 'Timestamp is required');
  var d = new Date(String(value));
  if (isNaN(d.getTime())) throw httpError_(400, 'Invalid Timestamp');
  return d;
}

function isWithinRange_(date, startDate, endDate) {
  return date.getTime() >= startDate.getTime() && date.getTime() <= endDate.getTime();
}

// =============================================================================
// シート操作
// =============================================================================

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw httpError_(500, 'Sheet not found: ' + name);
  return sheet;
}

function getSheetData_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { headers: values[0] || [], rows: [] };
  return { headers: values[0], rows: values.slice(1) };
}

function rowToObject_(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[String(headers[i])] = row[i];
  }
  return obj;
}

function appendRow_(sheet, values) {
  sheet.appendRow(values);
}

function deleteRowsByIndexes_(sheet, rowIndexesDesc) {
  rowIndexesDesc.sort(function (a, b) { return b - a; });
  for (var i = 0; i < rowIndexesDesc.length; i++) {
    sheet.deleteRow(rowIndexesDesc[i]);
  }
}

function findUserByLoginId_(loginId) {
  var normalized = normalizeLoginId_(loginId);
  var data = getSheetData_(getSheet_(CONFIG.SHEETS.USERS));
  for (var i = 0; i < data.rows.length; i++) {
    var row = rowToObject_(data.headers, data.rows[i]);
    if (normalizeLoginId_(row.LoginID) === normalized) {
      return mapUserRow_(row);
    }
  }
  return null;
}

function findUserByUUID_(userUUID) {
  var data = getSheetData_(getSheet_(CONFIG.SHEETS.USERS));
  for (var i = 0; i < data.rows.length; i++) {
    var row = rowToObject_(data.headers, data.rows[i]);
    if (String(row.UserUUID) === String(userUUID)) {
      return mapUserRow_(row);
    }
  }
  return null;
}

function findUserByWebhookToken_(token) {
  var data = getSheetData_(getSheet_(CONFIG.SHEETS.USERS));
  for (var i = 0; i < data.rows.length; i++) {
    var row = rowToObject_(data.headers, data.rows[i]);
    if (String(row.WebhookToken) === String(token)) {
      return mapUserRow_(row);
    }
  }
  return null;
}

function mapUserRow_(row) {
  return {
    userUUID: String(row.UserUUID),
    loginId: normalizeLoginId_(row.LoginID),
    passwordHash: String(row.PasswordHash),
    salt: String(row.Salt),
    tokenVersion: Number(row.TokenVersion || 1),
    webhookToken: String(row.WebhookToken || ''),
    createdAt: row.CreatedAt
  };
}

function updateUserRow_(userUUID, updates) {
  var sheet = getSheet_(CONFIG.SHEETS.USERS);
  var data = getSheetData_(sheet);
  for (var i = 0; i < data.rows.length; i++) {
    var row = rowToObject_(data.headers, data.rows[i]);
    if (String(row.UserUUID) === String(userUUID)) {
      var rowIndex = i + 2;
      if (updates.passwordHash != null) {
        setCellByHeader_(sheet, data.headers, rowIndex, 'PasswordHash', updates.passwordHash);
      }
      if (updates.salt != null) {
        setCellByHeader_(sheet, data.headers, rowIndex, 'Salt', updates.salt);
      }
      if (updates.tokenVersion != null) {
        setCellByHeader_(sheet, data.headers, rowIndex, 'TokenVersion', updates.tokenVersion);
      }
      return;
    }
  }
  throw httpError_(404, 'User not found');
}

function setCellByHeader_(sheet, headers, rowIndex, headerName, value) {
  var col = headers.indexOf(headerName);
  if (col < 0) throw httpError_(500, 'Missing column: ' + headerName);
  sheet.getRange(rowIndex, col + 1).setValue(value);
}

function deleteAllUserData_(userUUID) {
  var sheetNames = [
    CONFIG.SHEETS.PROFILES,
    CONFIG.SHEETS.MEALS,
    CONFIG.SHEETS.EXERCISES,
    CONFIG.SHEETS.WEIGHTS,
    CONFIG.SHEETS.CHAT_LOGS,
    CONFIG.SHEETS.DAILY_SUMMARIES,
    CONFIG.SHEETS.USERS
  ];
  sheetNames.forEach(function (name) {
    deleteRowsByUserUUID_(getSheet_(name), userUUID);
  });
}

function deleteRowsByUserUUID_(sheet, userUUID) {
  var data = getSheetData_(sheet);
  var userCol = data.headers.indexOf('UserUUID');
  if (userCol < 0) return;
  var indexes = [];
  for (var i = 0; i < data.rows.length; i++) {
    if (String(data.rows[i][userCol]) === String(userUUID)) {
      indexes.push(i + 2);
    }
  }
  deleteRowsByIndexes_(sheet, indexes);
}

function getRecordsByUser_(sheetName, userUUID, startDate, endDate, timestampField) {
  timestampField = timestampField || 'Timestamp';
  var data = getSheetData_(getSheet_(sheetName));
  var results = [];
  for (var i = 0; i < data.rows.length; i++) {
    var row = rowToObject_(data.headers, data.rows[i]);
    if (String(row.UserUUID) !== String(userUUID)) continue;
    var ts = new Date(row[timestampField]);
    if (isNaN(ts.getTime())) continue;
    if (startDate && endDate && !isWithinRange_(ts, startDate, endDate)) continue;
    results.push({ rowIndex: i + 2, row: row });
  }
  return results;
}

function getProfileRecord_(userUUID) {
  var data = getSheetData_(getSheet_(CONFIG.SHEETS.PROFILES));
  for (var i = 0; i < data.rows.length; i++) {
    var row = rowToObject_(data.headers, data.rows[i]);
    if (String(row.UserUUID) === String(userUUID)) {
      return { rowIndex: i + 2, row: row };
    }
  }
  return null;
}

function upsertProfile_(userUUID, profileData) {
  var sheet = getSheet_(CONFIG.SHEETS.PROFILES);
  var encrypted = encryptData_(profileData);
  var existing = getProfileRecord_(userUUID);
  if (existing) {
    var headers = getSheetData_(sheet).headers;
    setCellByHeader_(sheet, headers, existing.rowIndex, 'EncryptedData', encrypted);
    return existing.row.RecordID;
  }
  var recordId = generateUUID_();
  appendRow_(sheet, [recordId, userUUID, encrypted]);
  return recordId;
}

function findStepsRecordForDate_(userUUID, dateKey) {
  var dayStart = toTokyoDayStart_(dateKey);
  var dayEnd = toTokyoDayEnd_(dateKey);
  var records = getRecordsByUser_(CONFIG.SHEETS.EXERCISES, userUUID, dayStart, dayEnd);
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].row.ExerciseType) === 'steps') {
      return records[i];
    }
  }
  return null;
}

// =============================================================================
// 認証 API
// =============================================================================

function handleRegister_(body) {
  body = body || {};
  var loginId = validateLoginId_(body.loginId || body.LoginID);
  validatePassword_(body.password);

  if (findUserByLoginId_(loginId)) {
    throw httpError_(409, 'LoginID already exists');
  }

  var saltBytes = randomBytes_(CONFIG.PBKDF2_SALT_BYTES);
  var saltHex = bytesToHex_(saltBytes);
  var passwordHash = hashPassword_(body.password, saltBytes);
  var userUUID = generateUUID_();
  var webhookToken = generateUUID_().replace(/-/g, '');

  appendRow_(getSheet_(CONFIG.SHEETS.USERS), [
    userUUID,
    loginId,
    passwordHash,
    saltHex,
    1,
    webhookToken,
    nowIso_()
  ]);

  var token = issueJwt_(userUUID, loginId, 1);
  return {
    userUUID: userUUID,
    loginId: loginId,
    token: token,
    webhookToken: webhookToken
  };
}

function handleLogin_(body) {
  body = body || {};
  var loginId = validateLoginId_(body.loginId || body.LoginID);
  if (!body.password) throw httpError_(400, 'Password is required');

  var user = findUserByLoginId_(loginId);
  if (!user || !verifyPassword_(body.password, user.salt, user.passwordHash)) {
    throw httpError_(401, 'Invalid credentials');
  }

  var token = issueJwt_(user.userUUID, user.loginId, user.tokenVersion);
  return {
    userUUID: user.userUUID,
    loginId: user.loginId,
    token: token,
    webhookToken: user.webhookToken
  };
}

function handleRefresh_(auth) {
  var remainingDays = getJwtRemainingDays_(auth.jwtPayload);
  if (remainingDays <= 0) {
    throw httpError_(401, 'Token expired; login required');
  }
  if (remainingDays >= CONFIG.JWT_REFRESH_THRESHOLD_DAYS) {
    throw httpError_(400, 'Refresh allowed only when remaining validity is under 7 days');
  }

  var token = issueJwt_(auth.userUUID, auth.loginId, auth.tokenVersion);
  return {
    token: token,
    expiresInDays: CONFIG.JWT_EXPIRY_DAYS
  };
}

function handleChangePassword_(auth, body) {
  body = body || {};
  if (!body.oldPassword || !body.newPassword) {
    throw httpError_(400, 'oldPassword and newPassword are required');
  }
  validatePassword_(body.newPassword);

  var user = findUserByUUID_(auth.userUUID);
  if (!verifyPassword_(body.oldPassword, user.salt, user.passwordHash)) {
    throw httpError_(401, 'Old password is incorrect');
  }

  var saltBytes = randomBytes_(CONFIG.PBKDF2_SALT_BYTES);
  var saltHex = bytesToHex_(saltBytes);
  var passwordHash = hashPassword_(body.newPassword, saltBytes);
  var newTokenVersion = user.tokenVersion + 1;

  updateUserRow_(auth.userUUID, {
    passwordHash: passwordHash,
    salt: saltHex,
    tokenVersion: newTokenVersion
  });

  var token = issueJwt_(auth.userUUID, auth.loginId, newTokenVersion);
  return { token: token, tokenVersion: newTokenVersion };
}

function handleDeleteAccount_(auth, body) {
  body = body || {};
  if (!body.password) throw httpError_(400, 'password is required');

  var user = findUserByUUID_(auth.userUUID);
  if (!verifyPassword_(body.password, user.salt, user.passwordHash)) {
    throw httpError_(401, 'Password verification failed');
  }

  deleteAllUserData_(auth.userUUID);
  return { success: true };
}

// =============================================================================
// プロフィール API
// =============================================================================

function handleGetProfile_(auth) {
  var record = getProfileRecord_(auth.userUUID);
  if (!record) return { profile: null };
  return {
    recordId: record.row.RecordID,
    profile: decryptData_(record.row.EncryptedData)
  };
}

function handlePutProfile_(auth, body) {
  body = body || {};
  var profile = body.profile || body;
  validateProfileSchema_(profile);
  var recordId = upsertProfile_(auth.userUUID, profile);
  return { recordId: recordId, profile: profile };
}

function validateProfileSchema_(profile) {
  if (!profile || typeof profile !== 'object') throw httpError_(400, 'Invalid profile');
  var required = ['height', 'targetWeight', 'targetDate', 'age', 'sex', 'activityLevel'];
  required.forEach(function (key) {
    if (profile[key] == null) throw httpError_(400, 'Missing profile field: ' + key);
  });
}

// =============================================================================
// 食事 API
// =============================================================================

function handleGetMeals_(e, auth) {
  var range = getDateRangeFromRequest_(e);
  var records = getRecordsByUser_(CONFIG.SHEETS.MEALS, auth.userUUID, range.startDate, range.endDate);
  return {
    items: records.map(function (rec) {
      return {
        recordId: rec.row.RecordID,
        timestamp: rec.row.Timestamp,
        data: decryptData_(rec.row.EncryptedData)
      };
    })
  };
}

function handlePostMeals_(auth, body) {
  body = body || {};
  var timestamp = parseTimestamp_(body.timestamp || body.Timestamp);
  var data = body.data || body;
  validateMealSchema_(data);

  var recordId = generateUUID_();
  appendRow_(getSheet_(CONFIG.SHEETS.MEALS), [
    recordId,
    auth.userUUID,
    timestamp.toISOString(),
    encryptData_(data)
  ]);

  // DailySummaries を更新
  try {
    updateDailySummary_(auth.userUUID, toTokyoDateKey_(timestamp), {
      intakeKcal: Math.round(Number(data.calories || 0)),
      protein:    Number(data.protein || 0),
      fat:        Number(data.fat     || 0),
      carb:       Number(data.carb    || 0)
    });
  } catch (e) { /* サマリー更新失敗は記録を妨げない */ }

  return { recordId: recordId, timestamp: timestamp.toISOString(), data: data };
}

function validateMealSchema_(data) {
  var required = ['mealName', 'calories', 'protein', 'fat', 'carb'];
  required.forEach(function (key) {
    if (data[key] == null) throw httpError_(400, 'Missing meal field: ' + key);
  });
}

// =============================================================================
// 体重 API
// =============================================================================

function handleGetWeights_(e, auth) {
  var range = getDateRangeFromRequest_(e);
  var records = getRecordsByUser_(CONFIG.SHEETS.WEIGHTS, auth.userUUID, range.startDate, range.endDate);
  return {
    items: records.map(function (rec) {
      return {
        recordId: rec.row.RecordID,
        timestamp: rec.row.Timestamp,
        data: decryptData_(rec.row.EncryptedData)
      };
    })
  };
}

function handlePostWeights_(auth, body) {
  body = body || {};
  var timestamp = parseTimestamp_(body.timestamp || body.Timestamp);
  var data = body.data || body;
  if (data.weight == null) throw httpError_(400, 'Missing weight field');

  var recordId = generateUUID_();
  appendRow_(getSheet_(CONFIG.SHEETS.WEIGHTS), [
    recordId,
    auth.userUUID,
    timestamp.toISOString(),
    encryptData_({ weight: Number(data.weight) })
  ]);

  return { recordId: recordId, timestamp: timestamp.toISOString(), data: { weight: Number(data.weight) } };
}

// =============================================================================
// 運動 API
// =============================================================================

function handleGetExercises_(e, auth) {
  var range = getDateRangeFromRequest_(e);
  var records = getRecordsByUser_(CONFIG.SHEETS.EXERCISES, auth.userUUID, range.startDate, range.endDate);
  return {
    items: records.map(function (rec) {
      return {
        recordId: rec.row.RecordID,
        timestamp: rec.row.Timestamp,
        exerciseType: rec.row.ExerciseType,
        data: decryptData_(rec.row.EncryptedData)
      };
    })
  };
}

function handlePostExercises_(auth, body) {
  body = body || {};
  var timestamp = parseTimestamp_(body.timestamp || body.Timestamp);
  var exerciseType = String(body.exerciseType || body.ExerciseType || '').toLowerCase();
  if (['steps', 'workout', 'running'].indexOf(exerciseType) < 0) {
    throw httpError_(400, 'ExerciseType must be steps, workout, or running');
  }

  var data = body.data || body;
  validateExerciseSchema_(exerciseType, data);

  if (exerciseType === 'steps') {
    return upsertStepsExercise_(auth.userUUID, timestamp, data);
  }

  var recordId = generateUUID_();
  appendRow_(getSheet_(CONFIG.SHEETS.EXERCISES), [
    recordId,
    auth.userUUID,
    timestamp.toISOString(),
    exerciseType,
    encryptData_(data)
  ]);

  // DailySummaries を更新（歩数以外）
  try {
    var burnedKcal = Math.round(Number(data.caloriesBurned || 0));
    updateDailySummary_(auth.userUUID, toTokyoDateKey_(timestamp), { burnedKcal: burnedKcal });
  } catch (e) { /* ignore */ }

  return {
    recordId: recordId,
    timestamp: timestamp.toISOString(),
    exerciseType: exerciseType,
    data: data
  };
}

function validateExerciseSchema_(exerciseType, data) {
  if (exerciseType === 'steps') {
    if (data.steps == null) throw httpError_(400, 'Missing steps field');
    return;
  }
  var required = ['type', 'durationMinutes', 'caloriesBurned'];
  required.forEach(function (key) {
    if (data[key] == null) throw httpError_(400, 'Missing exercise field: ' + key);
  });
}

function upsertStepsExercise_(userUUID, timestamp, data) {
  var sheet = getSheet_(CONFIG.SHEETS.EXERCISES);
  var dateKey = toTokyoDateKey_(timestamp);
  var existing = findStepsRecordForDate_(userUUID, dateKey);
  var payload = { type: 'steps', steps: Number(data.steps) };
  var encrypted = encryptData_(payload);

  if (existing) {
    var headers = getSheetData_(sheet).headers;
    setCellByHeader_(sheet, headers, existing.rowIndex, 'Timestamp', timestamp.toISOString());
    setCellByHeader_(sheet, headers, existing.rowIndex, 'EncryptedData', encrypted);
    // DailySummaries を上書き更新（steps は upsert なので再計算）
    try {
      updateDailySummarySteps_(userUUID, dateKey, Number(data.steps));
    } catch (e) { /* ignore */ }
    return {
      recordId: existing.row.RecordID,
      timestamp: timestamp.toISOString(),
      exerciseType: 'steps',
      data: payload,
      updated: true
    };
  }

  var recordId = generateUUID_();
  appendRow_(sheet, [recordId, userUUID, timestamp.toISOString(), 'steps', encrypted]);
  // DailySummaries に新規追加
  try {
    updateDailySummarySteps_(userUUID, dateKey, Number(data.steps));
  } catch (e) { /* ignore */ }
  return {
    recordId: recordId,
    timestamp: timestamp.toISOString(),
    exerciseType: 'steps',
    data: payload,
    updated: false
  };
}

// =============================================================================
// チャット API
// =============================================================================

function handlePostChat_(auth, body) {
  body = body || {};
  var timestamp = parseTimestamp_(body.timestamp || body.Timestamp || new Date().toISOString());
  var data = body.data || body;
  if (!data.role || !data.message) {
    throw httpError_(400, 'role and message are required');
  }
  if (['user', 'assistant'].indexOf(String(data.role)) < 0) {
    throw httpError_(400, 'role must be user or assistant');
  }

  var recordId = generateUUID_();
  appendRow_(getSheet_(CONFIG.SHEETS.CHAT_LOGS), [
    recordId,
    auth.userUUID,
    timestamp.toISOString(),
    encryptData_({ role: String(data.role), message: String(data.message) })
  ]);

  return { recordId: recordId, timestamp: timestamp.toISOString() };
}

// =============================================================================
// Webhook API (iOS ショートカット)
// =============================================================================

function handleWebhook_(body, e) {
  body = body || {};
  var token = body.webhookToken || body.WebhookToken;
  if (!token && e && e.parameter) {
    token = e.parameter.webhookToken || e.parameter.token;
  }
  if (!token) throw httpError_(401, 'WebhookToken is required');

  var user = findUserByWebhookToken_(token);
  if (!user) throw httpError_(401, 'Invalid WebhookToken');

  if (body.steps == null) throw httpError_(400, 'steps is required');
  var timestamp = parseTimestamp_(body.timestamp || new Date().toISOString());

  var result = upsertStepsExercise_(user.userUUID, timestamp, { steps: Number(body.steps) });
  return { success: true, result: result };
}

// =============================================================================
// ダッシュボード API
// =============================================================================

function handleDashboard_(e, auth) {
  var params = (e && e.parameter) ? e.parameter : {};
  var targetDateKey = params.date ? toTokyoDateKey_(parseDateParam_(params.date, 'date')) : toTokyoDateKey_(new Date());
  var dayStart = toTokyoDayStart_(targetDateKey);
  var dayEnd = toTokyoDayEnd_(targetDateKey);

  var meals = getRecordsByUser_(CONFIG.SHEETS.MEALS, auth.userUUID, dayStart, dayEnd);
  var exercises = getRecordsByUser_(CONFIG.SHEETS.EXERCISES, auth.userUUID, dayStart, dayEnd);
  var weights = getRecordsByUser_(CONFIG.SHEETS.WEIGHTS, auth.userUUID, null, null);

  var intakeKcal = 0;
  var totalProtein = 0, totalFat = 0, totalCarb = 0;
  meals.forEach(function (rec) {
    var data = decryptData_(rec.row.EncryptedData);
    intakeKcal  += Number(data.calories || 0);
    totalProtein += Number(data.protein  || 0);
    totalFat     += Number(data.fat      || 0);
    totalCarb    += Number(data.carb     || 0);
  });

  var burnedKcal = 0;
  exercises.forEach(function (rec) {
    var data = decryptData_(rec.row.EncryptedData);
    if (String(rec.row.ExerciseType) === 'steps') {
      burnedKcal += estimateStepsCalories_(Number(data.steps || 0));
    } else {
      burnedKcal += Number(data.caloriesBurned || 0);
    }
  });

  var latestWeight = getLatestWeightOnOrBefore_(weights, dayEnd);
  var streakDays = calculateStreakDays_(auth.userUUID, targetDateKey);

  return {
    date: targetDateKey,
    intakeKcal: Math.round(intakeKcal),
    burnedKcal: Math.round(burnedKcal),
    balanceKcal: Math.round(intakeKcal - burnedKcal),
    totalProtein: Math.round(totalProtein * 10) / 10,
    totalFat:     Math.round(totalFat     * 10) / 10,
    totalCarb:    Math.round(totalCarb    * 10) / 10,
    latestWeight: latestWeight,
    streakDays: streakDays
  };
}

function estimateStepsCalories_(steps) {
  return Math.round(Number(steps || 0) * 0.04);
}

function getLatestWeightOnOrBefore_(weightRecords, cutoffDate) {
  var latest = null;
  weightRecords.forEach(function (rec) {
    var ts = new Date(rec.row.Timestamp);
    if (isNaN(ts.getTime()) || ts.getTime() > cutoffDate.getTime()) return;
    if (!latest || ts.getTime() > new Date(latest.timestamp).getTime()) {
      latest = {
        recordId: rec.row.RecordID,
        timestamp: rec.row.Timestamp,
        weight: decryptData_(rec.row.EncryptedData).weight
      };
    }
  });
  return latest;
}

function calculateStreakDays_(userUUID, targetDateKey) {
  var lookbackStart = toTokyoDayStart_(targetDateKey);
  lookbackStart.setDate(lookbackStart.getDate() - 400);
  var lookbackEnd = toTokyoDayEnd_(targetDateKey);

  var recordedDays = {};
  [CONFIG.SHEETS.MEALS, CONFIG.SHEETS.EXERCISES, CONFIG.SHEETS.WEIGHTS].forEach(function (sheetName) {
    var records = getRecordsByUser_(sheetName, userUUID, lookbackStart, lookbackEnd);
    records.forEach(function (rec) {
      recordedDays[toTokyoDateKey_(new Date(rec.row.Timestamp))] = true;
    });
  });

  var streak = 0;
  var cursor = toTokyoDayStart_(targetDateKey);
  while (true) {
    var key = toTokyoDateKey_(cursor);
    if (!recordedDays[key]) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// =============================================================================
// チャットログ バッチ削除 (Time-driven trigger 用)
// =============================================================================

/**
 * 毎日深夜に実行するトリガーを設定:
 *   Script Editor > Triggers > Add Trigger > cleanupChatLogsBatch > Time-driven > Day timer > Midnight
 */
function cleanupChatLogsBatch() {
  var sheet = getSheet_(CONFIG.SHEETS.CHAT_LOGS);
  var data = getSheetData_(sheet);
  var userCol = data.headers.indexOf('UserUUID');
  var tsCol = data.headers.indexOf('Timestamp');
  if (userCol < 0 || tsCol < 0) return;

  var byUser = {};
  for (var i = 0; i < data.rows.length; i++) {
    var userUUID = String(data.rows[i][userCol]);
    if (!byUser[userUUID]) byUser[userUUID] = [];
    byUser[userUUID].push({
      rowIndex: i + 2,
      timestamp: new Date(data.rows[i][tsCol]).getTime()
    });
  }

  var rowsToDelete = [];
  Object.keys(byUser).forEach(function (userUUID) {
    var entries = byUser[userUUID];
    if (entries.length <= CONFIG.CHAT_LOG_MAX_PER_USER) return;
    entries.sort(function (a, b) { return a.timestamp - b.timestamp; });
    var excess = entries.length - CONFIG.CHAT_LOG_MAX_PER_USER;
    for (var j = 0; j < excess; j++) {
      rowsToDelete.push(entries[j].rowIndex);
    }
  });

  deleteRowsByIndexes_(sheet, rowsToDelete);
}

// =============================================================================
// 初期セットアップ（初回のみ手動実行）
// =============================================================================

/**
 * スプレッドシートとシートヘッダーを初期化する。
 * Script Properties に SPREADSHEET_ID / JWT_SECRET / APP_SECRET_KEY を設定後、1 回実行。
 */
function setupSpreadsheet() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, CONFIG.SHEETS.USERS, [
    'UserUUID', 'LoginID', 'PasswordHash', 'Salt', 'TokenVersion', 'WebhookToken', 'CreatedAt'
  ]);
  ensureSheet_(ss, CONFIG.SHEETS.PROFILES, ['RecordID', 'UserUUID', 'EncryptedData']);
  ensureSheet_(ss, CONFIG.SHEETS.MEALS, ['RecordID', 'UserUUID', 'Timestamp', 'EncryptedData']);
  ensureSheet_(ss, CONFIG.SHEETS.EXERCISES, ['RecordID', 'UserUUID', 'Timestamp', 'ExerciseType', 'EncryptedData']);
  ensureSheet_(ss, CONFIG.SHEETS.WEIGHTS, ['RecordID', 'UserUUID', 'Timestamp', 'EncryptedData']);
  ensureSheet_(ss, CONFIG.SHEETS.CHAT_LOGS, ['RecordID', 'UserUUID', 'Timestamp', 'EncryptedData']);
  ensureSheet_(ss, CONFIG.SHEETS.DAILY_SUMMARIES, [
    'UserUUID', 'DateKey', 'IntakeKcal', 'BurnedKcal', 'ProteinG', 'FatG', 'CarbG'
  ]);
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
}

// =============================================================================
// DailySummaries — 日次集計シート
// =============================================================================

/**
 * /api/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 30日以内 → Meals/Exercises から動的集計
 * 30日以前 → DailySummaries シートから読み出し
 * 体重は Weights シートから常時読み出し
 */
function handleGetSummary_(e, auth) {
  var params = (e && e.parameter) ? e.parameter : {};
  var now = new Date();
  var todayKey = toTokyoDateKey_(now);
  var thirtyDaysAgoKey = toTokyoDateKey_(new Date(now.getTime() - 30 * 24 * 3600 * 1000));

  var fromKey = params.from ? String(params.from) : thirtyDaysAgoKey;
  var toKey   = params.to   ? String(params.to)   : todayKey;

  // 日付上限チェック (最大365日)
  if (fromKey > toKey) { var tmp = fromKey; fromKey = toKey; toKey = tmp; }

  var summaries = [];

  // 30日以内の範囲: 個別レコードから集計
  var recentFrom = (fromKey >= thirtyDaysAgoKey) ? fromKey : thirtyDaysAgoKey;
  if (recentFrom <= toKey) {
    summaries = summaries.concat(computeSummaryFromRecords_(auth.userUUID, recentFrom, toKey));
  }

  // 30日より古い範囲: DailySummaries シートから
  if (fromKey < thirtyDaysAgoKey) {
    var historicTo = dateAddDays_(thirtyDaysAgoKey, -1);
    if (fromKey <= historicTo) {
      var historic = readDailySummaries_(auth.userUUID, fromKey, historicTo);
      summaries = historic.concat(summaries);
    }
  }

  // 体重 (Weights シートを全期間から取得)
  var weightRecords = getRecordsByUser_(CONFIG.SHEETS.WEIGHTS, auth.userUUID,
    toTokyoDayStart_(fromKey), toTokyoDayEnd_(toKey));
  var weightByDate = {};
  weightRecords.forEach(function (rec) {
    var dk = toTokyoDateKey_(new Date(rec.row.Timestamp));
    var wd = decryptData_(rec.row.EncryptedData);
    var ts = new Date(rec.row.Timestamp).getTime();
    if (!weightByDate[dk] || ts > weightByDate[dk].ts) {
      weightByDate[dk] = { date: dk, weight: Number(wd.weight), ts: ts };
    }
  });
  var weights = Object.keys(weightByDate)
    .sort()
    .map(function (dk) {
      return { date: weightByDate[dk].date, weight: weightByDate[dk].weight };
    });

  return { from: fromKey, to: toKey, summaries: summaries, weights: weights };
}

/** Meals / Exercises シートから日次集計を動的に作成 */
function computeSummaryFromRecords_(userUUID, fromKey, toKey) {
  var fromDate = toTokyoDayStart_(fromKey);
  var toDate   = toTokyoDayEnd_(toKey);

  var mealRecs     = getRecordsByUser_(CONFIG.SHEETS.MEALS,     userUUID, fromDate, toDate);
  var exerciseRecs = getRecordsByUser_(CONFIG.SHEETS.EXERCISES, userUUID, fromDate, toDate);

  var byDate = {};
  function ensure(dk) {
    if (!byDate[dk]) byDate[dk] = { date: dk, intakeKcal: 0, burnedKcal: 0, protein: 0, fat: 0, carb: 0 };
  }

  mealRecs.forEach(function (rec) {
    var dk = toTokyoDateKey_(new Date(rec.row.Timestamp));
    ensure(dk);
    var d = decryptData_(rec.row.EncryptedData);
    byDate[dk].intakeKcal += Number(d.calories || 0);
    byDate[dk].protein    += Number(d.protein  || 0);
    byDate[dk].fat        += Number(d.fat      || 0);
    byDate[dk].carb       += Number(d.carb     || 0);
  });

  exerciseRecs.forEach(function (rec) {
    var dk = toTokyoDateKey_(new Date(rec.row.Timestamp));
    ensure(dk);
    var d = decryptData_(rec.row.EncryptedData);
    if (String(rec.row.ExerciseType) === 'steps') {
      byDate[dk].burnedKcal += estimateStepsCalories_(Number(d.steps || 0));
    } else {
      byDate[dk].burnedKcal += Number(d.caloriesBurned || 0);
    }
  });

  return Object.keys(byDate)
    .filter(function (dk) { return dk >= fromKey && dk <= toKey; })
    .sort()
    .map(function (dk) {
      var s = byDate[dk];
      return {
        date:        s.date,
        intakeKcal:  Math.round(s.intakeKcal),
        burnedKcal:  Math.round(s.burnedKcal),
        protein:     Math.round(s.protein * 10) / 10,
        fat:         Math.round(s.fat     * 10) / 10,
        carb:        Math.round(s.carb    * 10) / 10
      };
    });
}

/** DailySummaries シートから読み出し */
function readDailySummaries_(userUUID, fromKey, toKey) {
  var sheet;
  try { sheet = getSheet_(CONFIG.SHEETS.DAILY_SUMMARIES); }
  catch (e) { return []; } // シートが存在しない場合は空

  var data = getSheetData_(sheet);
  if (!data.headers || data.headers.length === 0) return [];

  var results = [];
  for (var i = 0; i < data.rows.length; i++) {
    var row = rowToObject_(data.headers, data.rows[i]);
    if (String(row.UserUUID) !== String(userUUID)) continue;
    var dk = String(row.DateKey);
    if (dk < fromKey || dk > toKey) continue;
    results.push({
      date:       dk,
      intakeKcal: Number(row.IntakeKcal || 0),
      burnedKcal: Number(row.BurnedKcal || 0),
      protein:    Number(row.ProteinG   || 0),
      fat:        Number(row.FatG       || 0),
      carb:       Number(row.CarbG      || 0)
    });
  }
  return results.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

/** DailySummaries にインクリメンタル更新 (食事・運動保存時に呼び出す) */
function updateDailySummary_(userUUID, dateKey, delta) {
  var sheet;
  try { sheet = getSheet_(CONFIG.SHEETS.DAILY_SUMMARIES); }
  catch (e) { return; } // シートがなければ何もしない

  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  if (headers.length === 0) return;

  var idxUUID    = headers.indexOf('UserUUID');
  var idxDate    = headers.indexOf('DateKey');
  var idxIntake  = headers.indexOf('IntakeKcal');
  var idxBurned  = headers.indexOf('BurnedKcal');
  var idxProtein = headers.indexOf('ProteinG');
  var idxFat     = headers.indexOf('FatG');
  var idxCarb    = headers.indexOf('CarbG');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idxUUID]) === String(userUUID) &&
        String(values[i][idxDate]) === String(dateKey)) {
      // 既存行を更新
      var r = i + 1;
      if (delta.intakeKcal) sheet.getRange(r, idxIntake  + 1).setValue(Number(values[i][idxIntake]  || 0) + delta.intakeKcal);
      if (delta.burnedKcal) sheet.getRange(r, idxBurned  + 1).setValue(Number(values[i][idxBurned]  || 0) + delta.burnedKcal);
      if (delta.protein)    sheet.getRange(r, idxProtein + 1).setValue(Number(values[i][idxProtein] || 0) + delta.protein);
      if (delta.fat)        sheet.getRange(r, idxFat     + 1).setValue(Number(values[i][idxFat]     || 0) + delta.fat);
      if (delta.carb)       sheet.getRange(r, idxCarb    + 1).setValue(Number(values[i][idxCarb]    || 0) + delta.carb);
      return;
    }
  }
  // 新規行追加
  sheet.appendRow([
    userUUID, dateKey,
    delta.intakeKcal  || 0,
    delta.burnedKcal  || 0,
    delta.protein     || 0,
    delta.fat         || 0,
    delta.carb        || 0
  ]);
}

/** 歩数 upsert 用: BurnedKcal を上書き (加算でなく再計算) */
function updateDailySummarySteps_(userUUID, dateKey, steps) {
  var sheet;
  try { sheet = getSheet_(CONFIG.SHEETS.DAILY_SUMMARIES); }
  catch (e) { return; }

  var newBurned = estimateStepsCalories_(steps);
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  if (headers.length === 0) return;

  var idxUUID   = headers.indexOf('UserUUID');
  var idxDate   = headers.indexOf('DateKey');
  var idxBurned = headers.indexOf('BurnedKcal');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idxUUID]) === String(userUUID) &&
        String(values[i][idxDate]) === String(dateKey)) {
      sheet.getRange(i + 1, idxBurned + 1).setValue(newBurned);
      return;
    }
  }
  // 行がなければ新規追加
  sheet.appendRow([userUUID, dateKey, 0, newBurned, 0, 0, 0]);
}

/** 日付キーに日数を加算 */
function dateAddDays_(dateKey, days) {
  var d = new Date(dateKey + 'T12:00:00+09:00');
  d.setDate(d.getDate() + days);
  return toTokyoDateKey_(d);
}

/**
 * dailyArchive — 毎日 AM 1:00 (JST) に Time-driven Trigger で実行
 * 前日の個別レコードを DailySummaries に永久保存 → 31日後に個別レコードを削除
 */
function dailyArchive() {
  var yesterday = dateAddDays_(toTokyoDateKey_(new Date()), -1);

  // 全ユーザーのUUIDを取得
  var usersData = getSheetData_(getSheet_(CONFIG.SHEETS.USERS));
  usersData.rows.forEach(function (rawRow) {
    var user = rowToObject_(usersData.headers, rawRow);
    var uuid = String(user.UserUUID);

    // 前日の集計を計算
    var daySummaries = computeSummaryFromRecords_(uuid, yesterday, yesterday);
    if (daySummaries.length === 0) return;

    var s = daySummaries[0];
    // DailySummaries に保存 (冪等)
    saveDailySummaryRow_(uuid, s);
  });
}

/** DailySummaries に1行書き込む (既存なら上書き) */
function saveDailySummaryRow_(userUUID, summary) {
  var sheet;
  try { sheet = getSheet_(CONFIG.SHEETS.DAILY_SUMMARIES); }
  catch (e) { return; }

  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  if (headers.length === 0) {
    sheet.appendRow(['UserUUID', 'DateKey', 'IntakeKcal', 'BurnedKcal', 'ProteinG', 'FatG', 'CarbG']);
    headers = sheet.getDataRange().getValues()[0];
    values = [headers];
  }
  var idxUUID   = headers.indexOf('UserUUID');
  var idxDate   = headers.indexOf('DateKey');
  var idxIntake = headers.indexOf('IntakeKcal');
  var idxBurned = headers.indexOf('BurnedKcal');
  var idxP      = headers.indexOf('ProteinG');
  var idxF      = headers.indexOf('FatG');
  var idxC      = headers.indexOf('CarbG');

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idxUUID]) === String(userUUID) &&
        String(values[i][idxDate]) === String(summary.date)) {
      var r = i + 1;
      sheet.getRange(r, idxIntake + 1).setValue(summary.intakeKcal);
      sheet.getRange(r, idxBurned + 1).setValue(summary.burnedKcal);
      sheet.getRange(r, idxP     + 1).setValue(summary.protein);
      sheet.getRange(r, idxF     + 1).setValue(summary.fat);
      sheet.getRange(r, idxC     + 1).setValue(summary.carb);
      return;
    }
  }
  sheet.appendRow([
    userUUID, summary.date,
    summary.intakeKcal, summary.burnedKcal,
    summary.protein, summary.fat, summary.carb
  ]);
}
