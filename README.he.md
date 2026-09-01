<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/stolz-readme-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="assets/brand/stolz-readme-light.png">
  <img src="assets/brand/stolz-readme-light.png" width="820" alt="STOLZ A.I. — האות S מדפי ספר מקופלים עם סימנייה אדומה">
</picture>

**חמש מיומנויות ממוקדות ל-Codex לעבודה יעילה של סוכני AI.**  
*אף טוקן לא מבוזבז.*

[English](README.md) · [Русский](README.ru.md) · [Nederlands](README.nl.md) · [中文](README.zh.md) · **עברית**

[![CI](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Sergey360/stolz-ai/actions/workflows/ci.yml)
[![Node.js ≥20](https://img.shields.io/badge/Node.js-%E2%89%A520-416B51?logo=nodedotjs&logoColor=white&style=flat-square)](package.json)
[![5 skills](https://img.shields.io/badge/focused_skills-5-BB7A2A?style=flat-square)](skills)
[![MIT](https://img.shields.io/badge/license-MIT-6F5B4E?style=flat-square)](LICENSE)
[![No token wasted](https://img.shields.io/badge/no_token-wasted-AD3F2E?style=flat-square)](docs/architecture.md)

</div>

> «Движений лишних у него не было» — ״לא היו לו תנועות מיותרות.״
>
> — [איוואן גונצ'רוב, *אובלומוב*, חלק ב׳](https://ilibrary.ru/text/475/p.13/index.html)

STOLZ A.I. מחיל את אותו העיקרון על סוכני AI: **כל טוקן צריך לבצע עבודה מועילה**.

**STOLZ** מתייחס לאנדריי איוואנוביץ' שטולץ. **A.I.** הוא גם *Andrei Ivanovich* וגם *Artificial Intelligence*. האות **S**, המקופלת מדפי ספר, והסימנייה האדומה הופכות את הרעיון לסמל: אין תנועה, עמוד או טוקן ללא מטרה.

## 🎯 מה נחסך

STOLZ A.I. כולל חמש מיומנויות קטנות שאפשר לשלב עבור Codex:

- 🧭 **מסלול** — לבחור מסלול אחד שמספיק למשימה במקום לטעון את כל ההוראות;
- 📖 **הקשר** — לקרוא רק את ההקשר שנדרש למסלול שנבחר;
- ♻️ **שימוש חוזר** — להשתמש שוב בתוצאה רק כל עוד הקלט והאימות שלה עדיין תואמים;
- 🔕 **מצב שקט** — להשאיר מצב polling שלא השתנה מחוץ לשיחה עם המודל;
- ⚖️ **Benchmark** — להשוות אופטימיזציה ל-baseline לפני שמכריזים עליה כשיפור.

המנגנונים האלה מצמצמים הקשר מיותר, קריאות, הפעלות כלים ודיווחי מצב חוזרים. הם אינם מבקשים מהמודל לחשוב פחות או לדלג על בדיקות.

## 📊 מה אנחנו יכולים להוכיח

תרחיש בחירת ההקשר הסינתטי המצורף מגיע לאותה תוצאה מאומתת עם פחות קלט שנכתב מראש:

| מסלול | יחידות טוקן שנכתבו מראש | הפעלות מודל | הפעלות כלים | אימות |
| --- | ---: | ---: | ---: | --- |
| Baseline | 1,530 | 4 | 8 | עבר |
| מותאם | **980** | **3** | **4** | עבר |
| הפרש | **−550 (−35.95%)** | −1 | −4 | תוצאה שקולה |

הנתון מוכיח שמערכת ה-benchmark והמסלול בעל ההקשר המצומצם עובדים בתרחיש הזה. הוא **אינו** מדידה של צריכת Codex ו**אינו** טענה לחיסכון כולל בסביבת production. ל-STOLZ A.I. עדיין אין טענה מדודה לגבי טוקנים של ספק המודל. ראו [תיעוד benchmark](docs/benchmarking.md) לראיות ולגבולות הפרשנות שלהן.

## 🚀 התקנה ב-Codex

Codex מגלה מיומנויות repository בתוך `.agents/skills`. מתיקיית הפרויקט שלכם:

```bash
git clone https://github.com/Sergey360/stolz-ai.git ../stolz-ai
npm --prefix ../stolz-ai ci
npm --prefix ../stolz-ai test
mkdir -p .agents/skills
cp -R ../stolz-ai/skills/stolz-* .agents/skills/
```

לאחר מכן ציינו את `$stolz-route` ב-Codex, או תנו ל-Codex לבחור מיומנות כשהמשימה מתאימה לתיאור שלה. התקנה ב-Windows והתקנה ברמת המשתמש מתוארות ב[מדריך ההתקנה](docs/installation.md).

## 🧰 חמש המיומנויות

| מיומנות | מתי להשתמש בה |
| --- | --- |
| [`stolz-route`](skills/stolz-route/SKILL.md) | כשנדרש המסלול הקטן ביותר שמספיק למשימה |
| [`stolz-context`](skills/stolz-context/SKILL.md) | כשההקשר צריך לעבור אימות ולהיטען בדיוק בזמן |
| [`stolz-reuse`](skills/stolz-reuse/SKILL.md) | כשקריאה, פקודה, הפעלת כלי או תוצאה מאומתת עשויות לחזור |
| [`stolz-quiet-state`](skills/stolz-quiet-state/SKILL.md) | כש-polling או ניסיונות חוזרים היו מדווחים שוב על מצב שלא השתנה |
| [`stolz-benchmark`](skills/stolz-benchmark/SKILL.md) | כששינוי יעילות דורש השוואה שמותנית בתוצאה שקולה |

## 🛡️ חיסכון בלי להחליש את האימות

אופטימיזציה תקפה רק כאשר התוצאה הנדרשת נשארת שקולה וכל הבדיקות הנדרשות עוברות. ריצה קטנה יותר עם תוצאה חלשה יותר היא רגרסיה, לא חיסכון. ראיה חסרה נשארת חסרה; STOLZ A.I. לעולם אינו הופך אותה לאפס.

המימוש מתואר ב[ארכיטקטורה](docs/architecture.md). בדיקות ה-repository מכסות בחירת מסלול, זהויות הקשר בלתי משתנות, שימוש חוזר מאומת, הסרת פעולות כפולות, מעברי מצב שקט ושערי benchmark.

```bash
npm test
npm run benchmark:check
```

## 📚 תיעוד

- [התקנה](docs/installation.md) — לפי repository, לפי משתמש, Windows ו-Unix;
- [ארכיטקטורה](docs/architecture.md) — חוזים, זהויות, שימוש חוזר, מצב שקט ושערים;
- [Benchmarking](docs/benchmarking.md) — ראיות שניתנות לשחזור וגבולות פרשנות;
- [מדיניות אבטחה](SECURITY.md) · [יומן שינויים](CHANGELOG.md).

## ⚖️ רישיון ועצמאות

[רישיון MIT](LICENSE). STOLZ A.I. הוא פרויקט עצמאי, ללא זיקה ל-OpenAI וללא תמיכה רשמית מ-OpenAI.

<p align="center">
  <sub>נוצר על ידי <a href="https://github.com/Sergey360">Sergey360</a> · תנועה ללא המיותר</sub>
</p>
