const RULES = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:sk-or-v1-|sk-proj-|AIza)[A-Za-z0-9_-]{16,}\b/g,
  /((?:^|\n)\s*(?:[A-Z][A-Z0-9_]*_?(?:KEY|TOKEN|SECRET|PASSWORD)|openrouter_key)\s*=\s*)[^\s#"'\\]+/gim,
  /("(?:private_key|api_key|access_token|client_secret)"\s*:\s*")[^"]+(?=")/gi,
];

export function redactSensitive(text) {
  let result = String(text);
  for (const rule of RULES) result = result.replace(rule, (match, prefix) => `${prefix && match.startsWith(prefix) ? prefix : ''}[REDACTED]`);
  return result;
}

export function redactStructured(value) {
  if (typeof value === 'string') return redactSensitive(value);
  if (Array.isArray(value)) return value.map(redactStructured);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactStructured(item)]));
  return value;
}
