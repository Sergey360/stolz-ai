import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { getPublicSurfaceProblems, PUBLIC_DOCUMENTS, PUBLIC_READMES, PUBLIC_SKILLS } from '../scripts/check-public-surface.mjs';

async function fixtureProject() {
  const root = await mkdtemp(resolve(tmpdir(), 'stolz-ai-public-surface-'));
  await Promise.all([
    mkdir(resolve(root, 'skills'), { recursive: true }),
    mkdir(resolve(root, 'docs'), { recursive: true }),
  ]);
  await Promise.all(PUBLIC_READMES.map(async (name) => {
    const links = name === 'README.md'
      ? PUBLIC_DOCUMENTS.map((document) => `[${document}](${document})`).join('\n')
      : '';
    await writeFile(resolve(root, name), `# ${name}\n${links}\n`);
  }));
  await Promise.all(PUBLIC_DOCUMENTS.map((name) => writeFile(resolve(root, name), `# ${name}\n`)));
  await Promise.all(PUBLIC_SKILLS.map(async (skill) => {
    await mkdir(resolve(root, 'skills', skill), { recursive: true });
    await writeFile(resolve(root, 'skills', skill, 'SKILL.md'), `# ${skill}\n`);
  }));
  await writeFile(resolve(root, 'package.json'), JSON.stringify({ name: 'surface-fixture', version: '1.0.0', files: ['README.md', 'README.ru.md', 'README.nl.md', 'README.zh.md', 'README.he.md', 'skills/'] }));
  return root;
}

async function problemsFor(mutate, options = {}) {
  const root = await fixtureProject();
  try {
    await mutate(root);
    return await getPublicSurfaceProblems({ root, checkPredecessors: false, ...options });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('repository public/package boundary is valid and npm dry-run matches the extracted archive', async () => {
  assert.deepEqual(await getPublicSurfaceProblems(), []);
});

test('public CI guard rejects every skill inventory mutation', async () => {
  const added = await problemsFor(async (root) => {
    await mkdir(resolve(root, 'skills', 'stolz-extra'));
    await writeFile(resolve(root, 'skills', 'stolz-extra', 'SKILL.md'), '# extra\n');
  });
  assert.match(added.join('\n'), /public skill inventory/);

  const missing = await problemsFor((root) => rm(resolve(root, 'skills', 'stolz-route'), { recursive: true }));
  assert.match(missing.join('\n'), /public skill inventory|missing public skill entrypoint/);
});

test('public CI guard rejects unallowlisted docs, missing localized READMEs, and broken local links', async () => {
  const extraDocument = await problemsFor(async (root) => {
    await writeFile(resolve(root, 'docs', 'extra.md'), '# extra\n');
    await writeFile(resolve(root, 'README.md'), '# README\n[extra](docs/extra.md)\n');
  });
  assert.match(extraDocument.join('\n'), /unallowlisted public document|allowlist/);

  const missingReadme = await problemsFor((root) => rm(resolve(root, 'README.he.md')));
  assert.match(missingReadme.join('\n'), /missing localized README|public README inventory/);

  const brokenLink = await problemsFor(async (root) => {
    await rm(resolve(root, 'docs', 'architecture.md'));
  });
  assert.match(brokenLink.join('\n'), /broken local link|missing public document/);
});

test('public CI guard rejects scripts, web, and internal leakage', async () => {
  for (const leakedPath of ['scripts/check.mjs', 'web/index.html', 'internal/ledger.json']) {
    const problems = await problemsFor((root) => writeFile(resolve(root, 'README.md'), `# README\n[leak](${leakedPath})\n`));
    assert.match(problems.join('\n'), /leaks forbidden local material/, leakedPath);
  }
});

test('public CI guard rejects npm docs and private-material drift from the extracted-package inventory', async () => {
  for (const [directory, file] of [
    ['docs', 'private.md'],
    ['scripts', 'private.mjs'],
    ['web', 'index.html'],
    ['internal', 'ledger.json'],
    ['contracts/multi-runtime-evidence-v0.7', 'private.schema.json'],
    ['tools/verified-reuse', 'run-installed-local-codex-scenarios.mjs'],
    ['benchmarks/context-state-v0.6', 'corpus.json'],
  ]) {
    const problems = await problemsFor(async (root) => {
      await mkdir(resolve(root, directory), { recursive: true });
      await writeFile(resolve(root, directory, file), 'private material\n');
      await writeFile(resolve(root, 'package.json'), JSON.stringify({
        name: 'surface-fixture',
        version: '1.0.0',
        files: ['README.md', 'README.ru.md', 'README.nl.md', 'README.zh.md', 'README.he.md', 'skills/', `${directory}/`],
      }));
    }, { checkPackage: true });
    assert.match(problems.join('\n'), new RegExp(`npm package leaks excluded material: ${directory}/`), directory);
  }
});

test('public CI guard rejects credential-like content in public documentation', async () => {
  const problems = await problemsFor((root) => writeFile(resolve(root, 'README.md'), '# README\ncredential: sk_123456789012345678901234\n'));
  assert.match(problems.join('\n'), /public privacy scan found a credential-like value: README\.md/);
});
