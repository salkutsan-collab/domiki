// Проверка PIN в браузере. Серверa у GitHub Pages нет, поэтому код сверяется
// на странице: в файле лежит не сам PIN, а его отпечаток (SHA-256 от соли и кода).
// Это защита от случайного захода, а не настоящий замок: четыре цифры можно
// перебрать. Ничего секретного внутри игры нет - только кубики на полянке.
//
// Поменять PIN: см. README, раздел «Как поменять PIN».

const SALT = '4f6ca04678d263bfc11f295f';
const PIN_HASH = 'da84ad5634cfce4b2964ab8c05ead79c9ccbeb0aa804e83276f8f4c6d4420206';
const STORAGE_KEY = 'domiki-access-v1';

async function fingerprint(pin: string) {
  const data = new TextEncoder().encode(`${SALT}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(pin: string) {
  const match = (await fingerprint(pin)) === PIN_HASH;
  if (match) {
    try {
      localStorage.setItem(STORAGE_KEY, PIN_HASH);
    } catch { /* Если хранилище недоступно, PIN спросим при следующем заходе. */ }
  }
  return match;
}

export function isUnlocked() {
  try {
    return localStorage.getItem(STORAGE_KEY) === PIN_HASH;
  } catch {
    return false;
  }
}
