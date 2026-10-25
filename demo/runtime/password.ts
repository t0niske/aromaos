/* Пароли в браузерной версии — подменяет src/lib/password.ts. База целиком у посетителя в браузере,
   поэтому настоящий scrypt здесь ничего не защищает; формат другой, чтобы не путать с серверным. */
export const hashPassword = (password: string) => `demo$${password}`;
export const verifyPassword = (password: string, stored: string) => stored === `demo$${password}`;
