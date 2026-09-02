<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/stolz-readme-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/stolz-readme-light.png">
  <img src="assets/brand/stolz-readme-light.png" width="820" alt="STOLZ A.I. — a folded book-page S with a red bookmark">
</picture>

**Five focused Codex skills for efficient AI-agent work.**  
*No token wasted.*

**English** · [Русский](README.ru.md) · [Nederlands](README.nl.md) · [中文](README.zh.md) · [עברית](README.he.md)

[![CI](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml)
[![Node.js ≥20](https://img.shields.io/badge/Node.js-%E2%89%A520-416B51?logo=nodedotjs&logoColor=white&style=flat-square)](package.json)
[![5 skills](https://img.shields.io/badge/focused_skills-5-BB7A2A?style=flat-square)](skills)
[![MIT](https://img.shields.io/badge/license-MIT-6F5B4E?style=flat-square)](LICENSE)
[![No token wasted](https://img.shields.io/badge/no_token-wasted-AD3F2E?style=flat-square)](docs/architecture.md)

</div>

**STOLZ** refers to Andrei Ivanovich Stolz, the energetic character in Ivan Goncharov's novel *Oblomov*.

**A.I.** brings together the character's initials (*Andrei Ivanovich*) and *Artificial Intelligence*.

> «Движений лишних у него не было» — “He made no unnecessary movements.”
>
> — [Ivan Goncharov, *Oblomov*, part II](https://ilibrary.ru/text/475/p.13/index.html)

The project follows the same principle: **every token should do useful work**.

## 🎯 What it saves

STOLZ A.I. is five small, composable skills for Codex:

- 🧭 **Route** — choose one sufficient route instead of loading every instruction;
- 📖 **Context** — read only the context required by that route;
- ♻️ **Reuse** — reuse a result only while its inputs and verification still match;
- 🔕 **Quiet state** — keep unchanged polling state outside the model conversation;
- ⚖️ **Benchmark** — compare an optimization with its baseline before calling it an improvement.

These mechanisms reduce redundant context, reads, tool calls, and status narration. They do not ask the model to think less or skip checks.

## 📊 What we can prove

The included synthetic context-selection fixture reaches the same validated outcome with less authored input:

| Route | Authored token units | Model wakeups | Tool calls | Verification |
| --- | ---: | ---: | ---: | --- |
| Baseline | 1,530 | 4 | 8 | passed |
| Optimized | **980** | **3** | **4** | passed |
| Difference | **−550 (−35.95%)** | −1 | −4 | equivalent outcome |

This proves that the benchmark harness and the narrow-context route work on that fixture. It is **not** a measurement of Codex usage and **not** a production-wide savings claim. STOLZ A.I. has no measured provider-token claim yet. See [benchmarking](docs/benchmarking.md) for the evidence and its limits.

## 🚀 Install in Codex

Codex discovers repository skills in `.agents/skills`. From your project directory:

```bash
git clone https://github.com/Sergey360/stolz-ai.git ../stolz-ai
npm --prefix ../stolz-ai ci
npm --prefix ../stolz-ai test
mkdir -p .agents/skills
cp -R ../stolz-ai/skills/stolz-* .agents/skills/
```

Then mention `$stolz-route` in Codex, or let Codex select a skill when the task matches its description. Windows and user-wide installation are covered in the [installation guide](docs/installation.md).

## 🧰 The five skills

| Skill | Use it when… |
| --- | --- |
| [`stolz-route`](skills/stolz-route/SKILL.md) | you need the smallest sufficient route for the task |
| [`stolz-context`](skills/stolz-context/SKILL.md) | context should be validated and loaded just in time |
| [`stolz-reuse`](skills/stolz-reuse/SKILL.md) | a verified read, command, tool call, or result may repeat |
| [`stolz-quiet-state`](skills/stolz-quiet-state/SKILL.md) | polling or retries would otherwise repeat unchanged state |
| [`stolz-benchmark`](skills/stolz-benchmark/SKILL.md) | an efficiency change needs an outcome-gated comparison |

## 🛡️ Economy without weaker verification

An optimization is valid only when the required outcome remains equivalent and all required checks pass. A smaller run with a weaker result is a regression, not a saving. Missing evidence stays missing; STOLZ A.I. never turns it into zero.

The implementation is described in [architecture](docs/architecture.md). The repository test suite covers route selection, immutable context identities, verified reuse, operation deduplication, quiet state transitions, and benchmark gates.

```bash
npm test
npm run benchmark:check
```

## 📚 Documentation

- [Installation](docs/installation.md) — repository-local, user-wide, Windows, and Unix flows;
- [Architecture](docs/architecture.md) — contracts, identities, reuse, quiet state, and benchmark gates;
- [Benchmarking](docs/benchmarking.md) — reproducible evidence and interpretation limits;
- [Security policy](SECURITY.md) · [Changelog](CHANGELOG.md).

## ⚖️ License and independence

[MIT licensed](LICENSE). STOLZ A.I. is an independent project and is not affiliated with or endorsed by OpenAI.

<p align="center">
  <sub>Created by <a href="https://github.com/Sergey360">Sergey360</a> · movement without the unnecessary</sub>
</p>
