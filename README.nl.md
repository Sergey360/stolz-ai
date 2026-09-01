<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/stolz-readme-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/stolz-readme-light.png">
  <img src="assets/brand/stolz-readme-light.png" width="820" alt="STOLZ A.I. — een S van gevouwen boekpagina's met een rode bladwijzer">
</picture>

**Vijf gerichte Codex-skills voor efficiënt werk van AI-agents.**  
*Geen token verspild.*

[English](README.md) · [Русский](README.ru.md) · **Nederlands** · [中文](README.zh.md) · [עברית](README.he.md)

[![CI](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml)
[![Node.js ≥20](https://img.shields.io/badge/Node.js-%E2%89%A520-416B51?logo=nodedotjs&logoColor=white&style=flat-square)](package.json)
[![5 skills](https://img.shields.io/badge/focused_skills-5-BB7A2A?style=flat-square)](skills)
[![MIT](https://img.shields.io/badge/licentie-MIT-6F5B4E?style=flat-square)](LICENSE)
[![Geen token verspild](https://img.shields.io/badge/no_token-wasted-AD3F2E?style=flat-square)](docs/architecture.md)

</div>

> «Движений лишних у него не было» — “Hij maakte geen onnodige bewegingen.”
>
> — [Ivan Gontsjarov, *Oblomov*, deel II](https://ilibrary.ru/text/475/p.13/index.html)

STOLZ A.I. past hetzelfde principe toe op AI-agents: **elke token moet nuttig werk verrichten**.

**STOLZ** verwijst naar Andrej Ivanovitsj Stolz. **A.I.** betekent zowel *Andrei Ivanovich* als *Artificial Intelligence*. De **S** van gevouwen boekpagina's en de rode bladwijzer maken van dat idee een beeldmerk: geen beweging, pagina of token zonder doel.

## 🎯 Wat het bespaart

STOLZ A.I. bestaat uit vijf kleine, combineerbare skills voor Codex:

- 🧭 **Route** — kies één toereikende route in plaats van alle instructies te laden;
- 📖 **Context** — lees alleen de context die voor die route nodig is;
- ♻️ **Hergebruik** — hergebruik een resultaat alleen zolang invoer en verificatie nog overeenkomen;
- 🔕 **Stille status** — houd ongewijzigde pollingstatus buiten het gesprek met het model;
- ⚖️ **Benchmark** — vergelijk een optimalisatie met de baseline voordat je haar een verbetering noemt.

Deze mechanismen verminderen overbodige context, leesacties, toolaanroepen en statusmeldingen. Ze vragen het model niet om minder na te denken of controles over te slaan.

## 📊 Wat we kunnen aantonen

De meegeleverde synthetische fixture voor contextselectie bereikt hetzelfde gevalideerde resultaat met minder vooraf geschreven invoer:

| Route | Geschreven tokeneenheden | Modelactivaties | Toolaanroepen | Verificatie |
| --- | ---: | ---: | ---: | --- |
| Baseline | 1.530 | 4 | 8 | geslaagd |
| Geoptimaliseerd | **980** | **3** | **4** | geslaagd |
| Verschil | **−550 (−35,95%)** | −1 | −4 | gelijkwaardig resultaat |

Dit toont aan dat de benchmark-harness en de route met beperkte context op deze fixture werken. Het is **geen** meting van Codex-gebruik en **geen** algemene claim over besparingen in productie. STOLZ A.I. heeft nog geen gemeten claim over provider-tokens. Zie [benchmarking](docs/benchmarking.md) voor het bewijs en de grenzen ervan.

## 🚀 Installeren in Codex

Codex vindt repository-skills in `.agents/skills`. Voer vanuit je projectmap uit:

```bash
git clone https://github.com/Sergey360/stolz-ai.git ../stolz-ai
npm --prefix ../stolz-ai ci
npm --prefix ../stolz-ai test
mkdir -p .agents/skills
cp -R ../stolz-ai/skills/stolz-* .agents/skills/
```

Noem daarna `$stolz-route` in Codex, of laat Codex een skill kiezen wanneer de taak bij de beschrijving past. Installatie voor Windows en voor de huidige gebruiker staat in de [installatiehandleiding](docs/installation.md).

## 🧰 De vijf skills

| Skill | Gebruik deze wanneer… |
| --- | --- |
| [`stolz-route`](skills/stolz-route/SKILL.md) | je de kleinste toereikende route voor de taak nodig hebt |
| [`stolz-context`](skills/stolz-context/SKILL.md) | context gevalideerd en precies op tijd geladen moet worden |
| [`stolz-reuse`](skills/stolz-reuse/SKILL.md) | een geverifieerde leesactie, opdracht, toolaanroep of uitkomst zich kan herhalen |
| [`stolz-quiet-state`](skills/stolz-quiet-state/SKILL.md) | polling of herhaalde pogingen anders dezelfde status opnieuw zouden melden |
| [`stolz-benchmark`](skills/stolz-benchmark/SKILL.md) | een efficiëntiewijziging een vergelijking met gelijkwaardig resultaat nodig heeft |

## 🛡️ Zuinigheid zonder zwakkere verificatie

Een optimalisatie is alleen geldig wanneer het vereiste resultaat gelijkwaardig blijft en alle vereiste controles slagen. Een kleinere run met een zwakker resultaat is een regressie, geen besparing. Ontbrekend bewijs blijft ontbreken; STOLZ A.I. maakt er nooit nul van.

De implementatie staat beschreven in [architectuur](docs/architecture.md). De testsuite controleert routeselectie, onveranderlijke contextidentiteiten, geverifieerd hergebruik, ontdubbeling van bewerkingen, stille statusovergangen en benchmark-gates.

```bash
npm test
npm run benchmark:check
```

## 📚 Documentatie

- [Installatie](docs/installation.md) — per repository, per gebruiker, Windows en Unix;
- [Architectuur](docs/architecture.md) — contracten, identiteiten, hergebruik, stille status en gates;
- [Benchmarking](docs/benchmarking.md) — reproduceerbaar bewijs en interpretatiegrenzen;
- [Beveiligingsbeleid](SECURITY.md) · [Wijzigingslogboek](CHANGELOG.md).

## ⚖️ Licentie en onafhankelijkheid

[MIT-licentie](LICENSE). STOLZ A.I. is een onafhankelijk project en is niet verbonden aan of goedgekeurd door OpenAI.

<p align="center">
  <sub>Gemaakt door <a href="https://github.com/Sergey360">Sergey360</a> · beweging zonder het overbodige</sub>
</p>
