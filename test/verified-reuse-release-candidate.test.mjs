import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v0.5.1 evidence remains immutable after the v0.7.1 package advance', async () => {
  const [pkgText, lockText, changelog, readiness, goalReview, ci, plan, graph] =
    await Promise.all([
      readText('package.json'),
      readText('package-lock.json'),
      readText('CHANGELOG.md'),
      readText('docs/VERIFIED_REUSE_RELEASE_READINESS_V0.5.md'),
      readText('docs/VERIFIED_REUSE_GOAL_REVIEW_V0.5.md'),
      readText('.gitlab-ci.yml'),
      readText('docs/IMPLEMENTATION_PLAN_V0.5.md'),
      readText('docs/SDLC_TASK_GRAPH_V0.5.md'),
    ]);

  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);
  assert.equal(pkg.version, '0.9.0');
  assert.equal(lock.version, '0.9.0');
  assert.equal(lock.packages[''].version, '0.9.0');
  assert.deepEqual(pkg.dependencies, { ajv: '8.20.0' });
  assert.deepEqual(lock.packages[''].dependencies, { ajv: '8.20.0' });
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(lock.packages[''].devDependencies, undefined);
  assert.equal(pkg.scripts.prepare, undefined);
  assert.equal(pkg.scripts.prepublishOnly, undefined);
  assert.equal(pkg.scripts.postinstall, undefined);

  const v051Start = changelog.indexOf('## [0.5.1]');
  const v05Start = changelog.indexOf('## [0.5.0]');
  const v041Start = changelog.indexOf('## [0.4.1]');
  assert.ok(v051Start >= 0 && v05Start > v051Start, '0.5.1 must precede 0.5.0');
  assert.ok(v041Start > v05Start, '0.5.0 must precede 0.4.1');
  const v051Entry = changelog.slice(v051Start, v05Start);
  const v05Entry = changelog.slice(v05Start, v041Start);
  for (const boundary of [
    'savings',
    'aggregate',
    'percentage',
    'cost',
    'provider-wide',
    'release',
    'publication',
  ]) assert.match(v051Entry, new RegExp(boundary, 'i'));
  assert.match(v051Entry, /claims remain withheld/i);
  assert.match(v051Entry, /fresh accepted-`dev`[\s\S]*independent patch-candidate review[\s\S]*protected-`main`/i);
  assert.match(v051Entry, /v0\.5\.0[\s\S]*85cd78650f9760255ab2a540fb4c806a9b5ba317/);
  assert.match(v051Entry, /pipeline 7311[\s\S]*7312[\s\S]*7313[\s\S]*7314/i);
  assert.match(v051Entry, /no package, GitLab Release, or[\s\S]*public publication was created/i);
  assert.match(v05Entry, /not successful[\s\S]*release or publication evidence/i);

  const expectedTag = `v${pkg.version}`;
  assert.equal(expectedTag, 'v0.9.0');
  assert.match(ci, /test "\$CI_COMMIT_TAG" = "v\$\(node -p "require\('\.\/package\.json'\)\.version"\)"/);
  assert.match(ci, /sha256sum "\$PACKAGE_FILE"/);
  assert.match(ci, /EXPECTED_PACKED_FILES=166/);
  assert.match(ci, /test "\$PACKED_FILES" -eq "\$EXPECTED_PACKED_FILES"/);

  assert.match(readiness, /Current decision: NO-GO; v0\.5\.1 requires fresh exact-source CI/i);
  assert.match(readiness, /85cd78650f9760255ab2a540fb4c806a9b5ba317/);
  assert.match(readiness, /\[7311\][\s\S]*\[7312\][\s\S]*\[7313\][\s\S]*\[7314\]/i);
  assert.match(readiness, /bddb06a52120e14f689186c0ab3dd8d7635d8535b2cfa357bc410cc36be1b0ef/);
  assert.match(readiness, /2f61dedce32e5bd632661014827a300531ab2e15cf1d7361ffa305a2abff2cb0/);
  assert.match(readiness, /Savings, aggregate, percentage, cost, provider-wide[\s\S]*claims are withheld/i);
  assert.match(readiness, /normal revert of the\s+Issue #300 patch commit/i);

  assert.match(goalReview, /Decision:\*\* `pending_independent_review`/);
  assert.doesNotMatch(goalReview, /Decision:\*\* `achieved`/);
  assert.match(goalReview, /does\s+not approve or close the independent gate/i);
  for (const id of ['GOAL-001', 'REQ-010', ...Array.from({ length: 12 }, (_, index) => `AC-254-${String(index + 1).padStart(2, '0')}`)]) {
    assert.match(goalReview, new RegExp(id));
  }

  const orderedMarkers = [
    '**S6 — pending independent review.**',
    '**S7 — blocked.**',
    '**S8 — blocked.**',
    '**S9 — blocked.**',
    '**S10 — blocked.**',
  ];
  let previous = -1;
  for (const marker of orderedMarkers) {
    const position = readiness.indexOf(marker);
    assert.ok(position > previous, `${marker} must follow its prerequisite`);
    previous = position;
  }
  for (const document of [readiness, plan]) {
    assert.match(document, /S6[\s\S]*S7[\s\S]*S8[\s\S]*S9[\s\S]*S10/);
  }
  assert.match(graph, /G6[\s\S]*G7[\s\S]*G8[\s\S]*G9[\s\S]*G10/);
});

test('manual release-evidence fetches every immutable predecessor tag before public-surface tests', async () => {
  const [ci, helper] = await Promise.all([
    readText('.gitlab-ci.yml'),
    readText('scripts/fetch-predecessor-tags.sh'),
  ]);
  const releaseStart = ci.indexOf('\nrelease-evidence:\n');
  assert.ok(releaseStart >= 0, 'release-evidence job must exist');
  const releaseJob = ci.slice(releaseStart);
  const fetchCommand = '- sh ./scripts/fetch-predecessor-tags.sh';
  const gitInstallIndex = releaseJob.indexOf('- apk add --no-cache git');
  const fetchIndex = releaseJob.indexOf(fetchCommand);
  assert.ok(gitInstallIndex >= 0, 'release-evidence must install Git in its isolated image');
  assert.ok(fetchIndex >= 0, 'release-evidence must call the shared predecessor helper');
  assert.ok(gitInstallIndex < fetchIndex, 'Git must be installed before the predecessor helper runs');
  for (const command of ['- npm test', '- npm run check:public-surface']) {
    const commandIndex = releaseJob.indexOf(command);
    if (commandIndex >= 0) {
      assert.ok(fetchIndex < commandIndex, `${fetchCommand} must precede ${command}`);
    }
  }

  const helperCalls = ci.match(/^\s+- sh \.\/scripts\/fetch-predecessor-tags\.sh$/gm) ?? [];
  assert.equal(helperCalls.length, 2, 'validate and release-evidence must reuse one helper');
  assert.match(helper, /set -eu/);
  for (const tag of ['v0.4.0', 'v0.4.1', 'v0.5.0', 'v0.5.1']) {
    const escaped = tag.replaceAll('.', '\\.');
    assert.match(helper, new RegExp(`refs/tags/${escaped}:refs/tags/${escaped}`));
    assert.match(helper, new RegExp(`refs/tags/${escaped}\\^\\{commit\\}`));
  }
  const helperCommands = helper.split('\n')
    .filter((line) => !line.trimStart().startsWith('#')).join('\n');
  assert.doesNotMatch(helperCommands, /(?:^|\s)--force(?:\s|$)/, 'immutable tags must not be force-updated');
  assert.doesNotMatch(releaseJob.slice(fetchIndex), /git fetch[^\n]*refs\/tags\/v0\./, 'the job must not drift to a second inline fetch');
});
