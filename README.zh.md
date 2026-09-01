<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/stolz-readme-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/stolz-readme-light.png">
  <img src="assets/brand/stolz-readme-light.png" width="820" alt="STOLZ A.I. — 由折叠书页组成的 S 与红色书签">
</picture>

**五个专注的 Codex 技能，让 AI 智能体更高效地工作。**  
*不浪费任何一个 token。*

[English](README.md) · [Русский](README.ru.md) · [Nederlands](README.nl.md) · **中文** · [עברית](README.he.md)

[![CI](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml)
[![Node.js ≥20](https://img.shields.io/badge/Node.js-%E2%89%A520-416B51?logo=nodedotjs&logoColor=white&style=flat-square)](package.json)
[![5 skills](https://img.shields.io/badge/focused_skills-5-BB7A2A?style=flat-square)](skills)
[![MIT](https://img.shields.io/badge/license-MIT-6F5B4E?style=flat-square)](LICENSE)
[![No token wasted](https://img.shields.io/badge/no_token-wasted-AD3F2E?style=flat-square)](docs/architecture.md)

</div>

> «Движений лишних у него не было»——“他没有多余的动作。”
>
> ——[伊万·冈察洛夫，《奥勃洛莫夫》第二部](https://ilibrary.ru/text/475/p.13/index.html)

STOLZ A.I. 将同一原则用于 AI 智能体：**每一个 token 都应该完成有用的工作**。

**STOLZ** 指向安德烈·伊万诺维奇·施托尔茨；**A.I.** 同时代表 *Andrei Ivanovich* 与 *Artificial Intelligence*。

## 🎯 它节省什么

STOLZ A.I. 由五个小而可组合的 Codex 技能组成：

- 🧭 **路由**——只选择一条足够完成任务的路径，而不是加载所有指令；
- 📖 **上下文**——只读取该路径真正需要的上下文；
- ♻️ **复用**——仅在输入与验证仍然一致时复用结果；
- 🔕 **静默状态**——将未变化的轮询状态留在模型对话之外；
- ⚖️ **基准测试**——先与基线比较，再判断优化是否真的成立。

这些机制减少重复上下文、读取、工具调用和状态说明；它们不会要求模型减少思考或跳过检查。

## 📊 我们已经证明了什么

随附的合成上下文选择 fixture，以更少的预编写输入达到了同样经过验证的结果：

| 路由 | 预编写 token 单位 | 模型唤醒次数 | 工具调用 | 验证 |
| --- | ---: | ---: | ---: | --- |
| 基线 | 1,530 | 4 | 8 | 通过 |
| 优化后 | **980** | **3** | **4** | 通过 |
| 差值 | **−550（−35.95%）** | −1 | −4 | 结果等价 |

这证明了基准测试框架和窄上下文路由能够在该 fixture 上工作。它**不是** Codex 实际用量的测量，也**不是**对生产环境整体节省幅度的承诺。STOLZ A.I. 目前尚未提出经过测量的供应商 token 声明。证据及其解释边界请参见[基准测试文档](docs/benchmarking.md)。

## 🚀 在 Codex 中安装

Codex 会在 `.agents/skills` 中发现仓库技能。请在你的项目目录中运行：

```bash
git clone https://github.com/Sergey360/stolz-ai.git ../stolz-ai
npm --prefix ../stolz-ai ci
npm --prefix ../stolz-ai test
mkdir -p .agents/skills
cp -R ../stolz-ai/skills/stolz-* .agents/skills/
```

之后可在 Codex 中提及 `$stolz-route`；也可以让 Codex 在任务符合描述时自动选择技能。Windows 与用户级安装方式见[安装指南](docs/installation.md)。

## 🧰 五个技能

| 技能 | 适用场景 |
| --- | --- |
| [`stolz-route`](skills/stolz-route/SKILL.md) | 任务需要最小且足够的执行路径 |
| [`stolz-context`](skills/stolz-context/SKILL.md) | 上下文应先验证，并在真正需要时加载 |
| [`stolz-reuse`](skills/stolz-reuse/SKILL.md) | 已验证的读取、命令、工具调用或结果可能重复出现 |
| [`stolz-quiet-state`](skills/stolz-quiet-state/SKILL.md) | 轮询或重试否则会重复报告未变化的状态 |
| [`stolz-benchmark`](skills/stolz-benchmark/SKILL.md) | 效率变更需要在结果等价的前提下进行比较 |

## 🛡️ 节省不能削弱验证

只有在必要结果保持等价且所有必要检查均通过时，优化才成立。运行更小但结果更弱，是退步而不是节省。缺失的证据仍然是缺失；STOLZ A.I. 绝不会把它变成零。

实现细节见[架构文档](docs/architecture.md)。仓库测试覆盖路由选择、不可变上下文身份、经过验证的复用、操作去重、静默状态转换和基准门禁。

```bash
npm test
npm run benchmark:check
```

## 📚 文档

- [安装](docs/installation.md)——仓库级、用户级、Windows 与 Unix 流程；
- [架构](docs/architecture.md)——契约、身份、复用、静默状态与门禁；
- [基准测试](docs/benchmarking.md)——可复现证据与解释边界；
- [安全策略](SECURITY.md) · [更新日志](CHANGELOG.md)。

## ⚖️ 许可与独立性

本项目采用 [MIT 许可证](LICENSE)。STOLZ A.I. 是独立项目，与 OpenAI 没有关联，也未获得 OpenAI 的背书。

<p align="center">
  <sub>由 <a href="https://github.com/Sergey360">Sergey360</a> 创建 · 去除多余的动作</sub>
</p>
