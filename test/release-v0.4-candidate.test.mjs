import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v0.4.1 release evidence remains bounded and immutable after the v0.6.0 tuple advance', async () => {
  const [pkgText, lockText, changelog, readiness, notes, ci, traceability, artifactsText] =
    await Promise.all([
      readText('package.json'),
      readText('package-lock.json'),
      readText('CHANGELOG.md'),
      readText('docs/RELEASE_READINESS_V0.4.md'),
      readText('docs/RELEASE_NOTES_V0.4.md'),
      readText('.gitlab-ci.yml'),
      readText('docs/SDLC_TRACEABILITY.md'),
      readText('docs/SDLC_ARTIFACTS.json'),
    ]);

  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);
  const artifacts = JSON.parse(artifactsText);

  assert.equal(pkg.version, '0.9.0');
  assert.equal(lock.version, '0.9.0');
  assert.equal(lock.packages[''].version, '0.9.0');
  assert.deepEqual(pkg.dependencies, { ajv: '8.20.0' });
  assert.deepEqual(Object.keys(pkg.exports).sort(), ['./codex-local-state', './profile-installer', './profile-resolver']);

  for (const document of [changelog, readiness, notes]) {
    assert.match(document, /combined[^\n]*-1,343|combined delta is `-1,343`/i);
    assert.match(document, /no aggregate|does not support an\s+aggregate/i);
  }

  assert.match(readiness, /Current decision: NO-GO/);
  assert.match(readiness, /Issue #217 may create separately versioned private tag `v0\.4\.1`/);
  assert.match(readiness, /public GitHub only the same immutable .*commit, tag/);
  assert.match(ci, /test "\$CI_COMMIT_TAG" = "v\$\(node -p/);
  assert.match(ci, /sha256sum "\$PACKAGE_FILE"/);
  assert.match(ci, /EXPECTED_PACKED_FILES=166/);
  assert.match(ci, /test "\$PACKED_FILES" -eq "\$EXPECTED_PACKED_FILES"/);
  assert.match(traceability, /Issue #215 v0\.4\.0 release readiness/);
  assert.ok(
    artifacts.artifacts.some(
      ({ path, issue_iid }) => path === 'docs/RELEASE_READINESS_V0.4.md' && issue_iid === 215,
    ),
  );
});
