# Contributing to STOLZ A.I.

Thanks for improving STOLZ A.I. Contributions should make an agent's work more
disciplined without weakening correctness, verification, reliability, or the
project's provider-neutral boundaries.

## Before opening a change

1. Read [the installation and compatibility guide](docs/INSTALLATION.md) and
   the relevant skill's `SKILL.md` plus its routed reference.
2. Keep each skill narrowly triggered. Do not turn a focused skill into a
   global prompt or load unrelated references by default.
3. Preserve safe fallbacks: missing adapter capability, changed identity,
   failed verification, or malformed input must not silently lower a gate.
4. Do not add a numerical token-saving claim without reproducible,
   outcome-gated benchmark evidence.

## Local checks

```bash
npm install
npm test
npm run build
```

Add or update a deterministic test for a changed contract, skill behavior,
adapter capability, or public document. Keep tests free of credentials,
private operational details, and unstable external dependencies.

## Documentation and brand

Use `STOLZ A.I.` for the product and `stolz-ai` for technical identifiers.
Follow [docs/BRAND_PLATFORM.md](docs/BRAND_PLATFORM.md) for tone, naming, and
the independence notice. Public copy is concise, calm, and evidence-led; it
does not imply OpenAI affiliation or endorsement, promise savings without
accepted evidence, or use third-party visual material without permission.

## Submitting changes

Describe the problem, selected route or contract boundary, validation output,
and any compatibility or documentation impact. Keep unrelated formatting or
refactors out of the change. Security-sensitive findings belong in
[SECURITY.md](SECURITY.md), not a public issue.
