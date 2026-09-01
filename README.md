# STOLZ A.I.

> «Движений лишних у него не было» — “He made no unnecessary movements.”
>
> — [Ivan Goncharov, *Oblomov*, part II](https://ilibrary.ru/text/475/p.13/index.html)

STOLZ A.I. applies the same principle to AI agents: every token should do useful work.

**STOLZ** points to Andrei Ivanovich Stolz. **A.I.** is both Andrei Ivanovich and Artificial Intelligence.

**No token wasted.**

[Русская версия](README.ru.md)

## What it saves

STOLZ A.I. is five small, composable skills for Codex:

- choose one sufficient route instead of loading every instruction;
- read only the context required by that route;
- reuse a result only while its inputs and verification still match;
- keep unchanged polling state outside the model conversation;
- compare an optimization with its baseline before calling it an improvement.

These mechanisms reduce redundant context, reads, tool calls, and status narration. They do not ask the model to think less or skip checks.

## What we can prove

The included synthetic context-selection fixture completes the same validated outcome with 980 authored token units instead of 1,530. This proves that the benchmark harness and the narrow-context route work on that fixture.

It is not a measurement of Codex usage and not a production-wide savings claim. STOLZ A.I. has no measured provider-token claim yet. See [benchmarking](docs/benchmarking.md) for the evidence and its limits.

## Install in Codex

Codex discovers repository skills in `.agents/skills`. From your project directory:

```bash
git clone https://github.com/Sergey360/stolz-ai.git ../stolz-ai
npm --prefix ../stolz-ai ci
npm --prefix ../stolz-ai test
mkdir -p .agents/skills
cp -R ../stolz-ai/skills/stolz-* .agents/skills/
```

Then mention `$stolz-route` in Codex, or let Codex select a skill when the task matches its description. Windows and user-wide installation are covered in the [installation guide](docs/installation.md).

## The five skills

| Skill | Use it when… |
| --- | --- |
| [`stolz-route`](skills/stolz-route/SKILL.md) | you need the smallest sufficient route for the task |
| [`stolz-context`](skills/stolz-context/SKILL.md) | context should be validated and loaded just in time |
| [`stolz-reuse`](skills/stolz-reuse/SKILL.md) | a verified read, command, tool call, or result may repeat |
| [`stolz-quiet-state`](skills/stolz-quiet-state/SKILL.md) | polling or retries would otherwise repeat unchanged state |
| [`stolz-benchmark`](skills/stolz-benchmark/SKILL.md) | an efficiency change needs an outcome-gated comparison |

## Economy without weaker verification

An optimization is valid only when the required outcome remains equivalent and all required checks pass. A smaller run with a weaker result is a regression, not a saving. Missing evidence stays missing; STOLZ A.I. never turns it into zero.

The implementation is described in [architecture](docs/architecture.md). The repository test suite covers route selection, immutable context identities, verified reuse, operation deduplication, quiet state transitions, and benchmark gates.

```bash
npm test
npm run benchmark:check
```

## License and independence

[MIT licensed](LICENSE). STOLZ A.I. is an independent project and is not affiliated with or endorsed by OpenAI.
