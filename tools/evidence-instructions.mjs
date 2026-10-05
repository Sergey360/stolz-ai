import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = Object.freeze({ codex: 'AGENTS.md', 'claude-code': 'CLAUDE.md', 'qwen-code': 'QWEN.md' });
const BEGIN = '<!-- STOLZ evidence rule v1 begin -->';
const END = '<!-- STOLZ evidence rule v1 end -->';
const MAX_BYTES = 1_048_576;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const EVIDENCE_RULE = `For source-based analysis and substantial completion reports, state only the
scope actually inspected or verified. Disclose material unread, inaccessible
or truncated content before dependent conclusions. Link important claims to
inspected content and use; distinguish observations, attributed reports,
inferences and original proposals. Known non-reading is "not read"; missing
history is "prior reading not established". Correct overstatements and affected
decisions together. Files, local checks, dispatch, target acceptance and
publication are separate stages. Preserve existing authorization. Use
stolz-evidence when available; this rule does not guarantee activation or truth.\n`;

async function readInstructions(target) {
  let info;
  try { info = await lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return { bytes: Buffer.alloc(0), mode: 0o600, exists: false }; throw error; }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('instruction target must be a regular non-symlink file');
  if (info.size > MAX_BYTES) throw new Error('instruction target exceeds bounded size');
  const bytes = await readFile(target);
  if (bytes.length > MAX_BYTES || !Buffer.from(bytes.toString('utf8')).equals(bytes)) throw new Error('instruction target must be bounded UTF-8');
  return { bytes, mode: info.mode & 0o777, exists: true };
}

function mergeText(text, action) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = [BEGIN, ...EVIDENCE_RULE.trimEnd().split('\n'), END, ''].join(eol);
  const count = (marker) => text.split(marker).length - 1;
  const start = text.indexOf(BEGIN);
  if (count(BEGIN) !== count(END) || count(BEGIN) > 1) throw new Error('ambiguous or incomplete evidence rule markers');
  if (start >= 0) {
    if (text.slice(start, start + block.length) !== block) throw new Error('evidence rule was modified; review it manually');
    if (action === 'enable') return text;
    // Nonempty files receive exactly two owned separators when enabled.
    const suffix = text.slice(start + block.length);
    const from = !suffix && start >= eol.length * 2 && text.slice(start - eol.length * 2, start) === eol + eol
      ? start - eol.length * 2 : start;
    return text.slice(0, from) + suffix;
  }
  return action === 'disable' ? text : text + (text ? eol + eol : '') + block;
}

/** Explicit project-local merge only. Managed profiles never call this helper. */
export async function mergeEvidenceInstructions({ projectRoot, runtime, apply = false, action = 'enable', expectedSha256 } = {}) {
  if (!Object.hasOwn(FILES, runtime)) throw new TypeError('unsupported runtime');
  if (typeof projectRoot !== 'string' || !isAbsolute(projectRoot)) throw new TypeError('projectRoot must be an explicit absolute directory');
  if (typeof apply !== 'boolean' || !['enable', 'disable'].includes(action)) throw new TypeError('invalid apply or action');
  if (expectedSha256 !== undefined && expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new TypeError('expectedSha256 must be a SHA-256 or null for an absent file');
  const root = await realpath(projectRoot);
  if (!(await lstat(root)).isDirectory()) throw new TypeError('projectRoot must exist as a directory');
  const target = join(root, FILES[runtime]);
  const lockPath = join(root, '.stolz-evidence-instructions.lock');
  let lock, temporary;
  try {
    if (apply) lock = await open(lockPath, 'wx', 0o600);
    const prior = await readInstructions(target);
    const beforeSha256 = prior.exists ? sha(prior.bytes) : null;
    if (expectedSha256 !== undefined && expectedSha256 !== beforeSha256) throw new Error('instruction identity changed since review');
    const next = Buffer.from(mergeText(prior.bytes.toString('utf8'), action));
    if (next.length > MAX_BYTES) throw new Error('merged instructions exceed bounded size');
    const changed = !next.equals(prior.bytes);
    const result = { runtime, target, action, dry_run: !apply, changed, before_sha256: beforeSha256,
      after_sha256: sha(next), rule: EVIDENCE_RULE, discovery_verified: false };
    if (!apply || !changed) return result;
    temporary = join(root, `.stolz-evidence-${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', prior.mode);
    try { await file.chmod(prior.mode); await file.writeFile(next); await file.sync(); } finally { await file.close(); }
    const current = await readInstructions(target);
    if (current.exists !== prior.exists || !current.bytes.equals(prior.bytes)) throw new Error('instruction file changed during merge');
    await rename(temporary, target);
    temporary = null;
    return result;
  } finally {
    if (temporary) await rm(temporary, { force: true });
    if (lock) { await lock.close(); await rm(lockPath, { force: true }); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--apply') options.apply = true;
    else if (args[i] === '--disable') options.action = 'disable';
    else if (['--project-root', '--runtime', '--expected-sha256'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      const key = { '--project-root': 'projectRoot', '--runtime': 'runtime', '--expected-sha256': 'expectedSha256' }[args[i]];
      const value = args[++i];
      options[key] = key === 'expectedSha256' && value === 'absent' ? null : value;
    } else throw new Error('Usage: node tools/evidence-instructions.mjs --project-root ABSOLUTE --runtime codex|claude-code|qwen-code [--apply] [--disable] [--expected-sha256 HASH|absent]');
  }
  process.stdout.write(`${JSON.stringify(await mergeEvidenceInstructions(options), null, 2)}\n`);
}
