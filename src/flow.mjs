import { basename, resolve } from 'node:path';
import { fingerprint } from './audit.mjs';

// Deliberately narrow: this is a high-confidence flow sensor, not a shell parser.
export const FLOW_POLICY = Object.freeze({ id: 'flow-v5', lookbackMs: 5 * 60_000 });
export const flowPolicyHash = fingerprint(JSON.stringify(FLOW_POLICY));

const PUBLIC_SUFFIX = /\.(?:example|sample|template|dist|example\.json)$/i;
const FILE_WORD = /(?:^|[\s'"=:@])((?:\.{0,2}\/|~\/|\/)?[^\s'"|;&<>]+)(?=$|[\s'"|;&<>])/g;

export function isProtectedPath(value) {
  if (typeof value !== 'string') return false;
  const name = basename(value.replace(/^["'@]+|["']+$/g, ''));
  if (!name || PUBLIC_SUFFIX.test(name)) return false;
  return /^\.env(?:\.|$)/i.test(name)
    || /^(?:id_rsa|id_ed25519|credentials?(?:[._-]|$)|private[_-]?key(?:[._-]|$)|service[_-]?account(?:[._-]|$))/i.test(name);
}

function pathHash(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return fingerprint(resolve(value.trim().replace(/^["'@]+|["']+$/g, '')));
}

// Only high-signal literals are linked. These hashes are evidence references,
// not anonymization; a guessable literal can still be dictionary-attacked.
export function literalEvidenceHashes(value) {
  const literals = String(value).match(/\b(?:[A-Z][A-Z0-9_-]{9,}|[A-Za-z0-9_-]{16,})\b/g) ?? [];
  return [...new Set(literals.map((literal) => fingerprint(literal)))].slice(0, 64);
}

export function hasAgentDirective(value) {
  return /\b(?:ignore|forward|upload|transmit|include|append|publish|send|add|must|should|assistant|tool call|system message)\b/i.test(String(value));
}

function commandPaths(command) {
  return [...String(command).matchAll(FILE_WORD)].map((match) => match[1]);
}

function executes(command, names) {
  return new RegExp(`(?:^|(?:&&|\\|\\||[;|])\\s*)(?:sudo\\s+)?(?:${names})\\b`, 'i').test(command);
}

function egressFiles(command) {
  const files = [];
  for (const match of String(command).matchAll(/(--data(?:-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)(?:\s+|=)(?:[\w-]+=)?['"]?(@?[^\s'";|]+)/gi)) {
    const option = match[1];
    const value = match[2];
    if (value.startsWith('@') || /^(?:--upload-file|-T)$/i.test(option)) files.push(value.replace(/^@/, ''));
  }
  const transfer = String(command).match(/\b(?:scp|rsync)\s+(?:-[^\s]+\s+)*([^\s]+)\s+[^\s]*@[^\s:]+:/i);
  if (transfer) files.push(transfer[1]);
  const gist = String(command).match(/\bgh\s+gist\s+create\s+(?:-[^\s]+\s+)*([^\s]+)/i);
  if (gist) files.push(gist[1]);
  const wgetPost = String(command).match(/--post-file(?:=|\s+)['"]?([^\s'";|]+)/i);
  if (wgetPost) files.push(wgetPost[1]);
  return files;
}

function unwrapShell(command) {
  const match = String(command).match(/^\s*(?:bash|sh)\s+-c\s+(["'])([\s\S]*)\1\s*$/i);
  return match ? match[2] : String(command);
}

// Inline interpreter calls are common escape hatches around shell-only egress rules.
// Match literal source, not arbitrary script files or encoded/dynamically built code.
function inlineCodeFlow(command) {
  const inline = /(?:^|(?:&&|\|\||[;|])\s*)(?:python(?:3(?:\.\d+)?)?\s+-c|node\s+(?:-e|--eval))\s+(['"])([\s\S]*?)\1\s*$/i.exec(command);
  if (!inline) return { protectedRead: false, outbound: false };
  const code = inline[2];
  const protectedLiteral = [...code.matchAll(/(['"])([^'"\n]+)\1/g)].some((match) => isProtectedPath(match[2]));
  const protectedRead = protectedLiteral && /\b(?:open|read_text|read_bytes|readFile(?:Sync)?|createReadStream|Path)\s*\(/i.test(code);
  const outbound = /\b(?:requests\.(?:post|put|patch)|httpx\.(?:post|put|patch)|urllib\.request\.(?:urlopen|Request)|fetch|axios\.(?:post|put|patch)|https?\.request|XMLHttpRequest)\s*\(/i.test(code)
    || /\brequire\s*\(\s*['"]https?['"]\s*\)\s*\.\s*(?:request|get)\s*\(/i.test(code);
  return { protectedRead, outbound };
}

function isOutbound(tool, command) {
  if (tool !== 'bash') return /(?:^|[./:_-])(?:send|upload|publish|post)(?:$|[./:_-])/i.test(tool);
  return (executes(command, 'curl') && /(?:--data(?:-binary|-raw|-urlencode)?\b|-d(?:\s|=)|--form\b|-F(?:\s|=)|--upload-file\b|-T(?:\s|=)|-X\s+(?:POST|PUT|PATCH)\b)/i.test(command))
    || (executes(command, 'wget') && /--post-(?:data|file)\b/i.test(command))
    || (executes(command, 'scp|rsync') && /\s[^\s]*@[^\s:]+:/i.test(command))
    || (executes(command, 'git') && /\bgit\s+push\b/i.test(command))
    || (executes(command, 'gh') && /\bgh\s+gist\s+create\b/i.test(command));
}

export function classifyFlowCall(tool, input) {
  const command = tool === 'bash' ? unwrapShell(input?.command ?? input?.cmd ?? '') : '';
  const inline = tool === 'bash' ? inlineCodeFlow(command) : { protectedRead: false, outbound: false };
  const target = String(input?.path ?? input?.file_path ?? input?.filePath ?? '');
  const visibleContent = tool !== 'bash' && ['content', 'message', 'text', 'body'].find((key) => typeof input?.[key] === 'string');
  const words = tool === 'bash' ? commandPaths(command) : [];
  const shellRead = tool === 'bash' && executes(command, 'cat|head|tail|sed|grep|base64|openssl|tar|cp');
  const protectedRead = (tool === 'read' && isProtectedPath(target)) || (shellRead && words.some(isProtectedPath)) || inline.protectedRead;
  const outbound = isOutbound(tool, command) || inline.outbound;
  const outboundFiles = outbound ? (tool === 'bash' ? egressFiles(command) : [target].filter(Boolean)) : [];
  const commandSubstitution = outbound && [...command.matchAll(/\$\(\s*(?:cat|head|tail|sed)\s+([^\s)]+)[^)]*\)/gi)]
    .some((match) => isProtectedPath(match[1]));
  const directProtectedEgress = outbound && (outboundFiles.some(isProtectedPath) || commandSubstitution || inline.protectedRead);
  const artifactHashes = outboundFiles.map(pathHash).filter(Boolean);
  const stagedPath = tool === 'bash' && executes(command, 'base64|openssl|tar|cp')
    ? command.match(/(?:>\s*|\b(?:cp|mv)\s+[^\s]+\s+)([^\s|;&]+)/)?.[1] : null;
  return {
    protectedRead,
    outbound,
    directProtectedEgress,
    artifactHashes,
    stagedArtifactHash: stagedPath ? pathHash(stagedPath) : null,
    inlineContentVisible: Boolean(visibleContent),
    inlineContentHashes: visibleContent ? literalEvidenceHashes(input[visibleContent]) : [],
  };
}

function isEffective(entry, reviews) {
  if (entry.outcome === 'allow') return true;
  if (entry.boundary === 'tool_result' && entry.outcome !== 'block') return true;
  return entry.outcome === 'ask' && reviews.has(entry.hash);
}

export function evaluateFlow(current, entries, now = Date.now()) {
  if (current.directProtectedEgress) {
    return { action: 'block', ruleId: 'direct-protected-egress', reason: 'Direct upload of a credential-like file', parentDecisionRefs: [] };
  }
  if (current.protectedRead && !current.outbound) {
    return { action: 'ask', ruleId: 'protected-read', reason: 'Reading a credential-like file requires confirmation', parentDecisionRefs: [] };
  }
  if (!current.outbound) return null;
  const recent = entries.filter((entry) => {
    const at = Date.parse(entry.at ?? '');
    return Number.isFinite(at) && now - at >= 0 && now - at <= FLOW_POLICY.lookbackMs;
  });
  const reviews = new Set(recent.filter((entry) => entry.boundary === 'human_review' && entry.outcome === 'approved').map((entry) => entry.decisionRef));
  const exposures = recent.filter((entry) => entry.flow?.protectedRead
    && (isEffective(entry, reviews) || (entry.outcome === 'ask' && ['claude', 'deepseek-harness'].includes(entry.host))));
  const staged = recent.filter((entry) => entry.flow?.protectedRead && entry.flow?.stagedArtifactHash && isEffective(entry, reviews)
    && current.artifactHashes.includes(entry.flow.stagedArtifactHash));
  const injections = recent.filter((entry) => entry.boundary === 'tool_result' && entry.flow?.untrustedOutput
    && (!current.inlineContentVisible || entry.flow.literalHashes?.some((hash) => current.inlineContentHashes.includes(hash))));
  const source = staged.at(-1) ?? exposures.at(-1) ?? injections.at(-1);
  if (!source) return null;
  const ruleId = staged.length ? 'staged-artifact-egress' : exposures.length ? 'protected-read-to-egress' : 'untrusted-output-to-egress';
  return { action: 'ask', ruleId, reason: staged.length
    ? 'A locally staged artifact follows a protected read and is about to leave the agent'
    : exposures.length ? 'A recent credential-like read is followed by an outbound action'
      : 'An untrusted tool result is followed by an outbound action',
    parentDecisionRefs: [source.hash].filter(Boolean) };
}
