# שרת המדריך החכם (Cloudflare Worker)

שרת קטן שמחזיק את מפתח Gemini בסוד, כדי שהמדריך החכם יעבוד לכל מי שמשתמש במסע.
הכל בחינם: Google AI Studio בלי חיוב, ו-Cloudflare Workers בתוכנית החינמית (100,000 בקשות ביום).

1. Google AI Studio (https://aistudio.google.com/apikey) → Create API key. לא מפעילים חיוב (Billing), וכך אין סיכוי לחשבון לתשלום.
2. Cloudflare (https://dash.cloudflare.com) → נרשמים בחינם → Workers & Pages → Create → Worker → שם: masa-ai → Deploy.
3. Edit code → מוחקים הכל ומדביקים את worker.js → Deploy.
4. Settings → Variables and Secrets → Add → Type: Secret, Name: GEMINI_KEY, Value: המפתח → Deploy.
5. (רשות) מידע עדכני: נרשמים בחינם ב-https://tavily.com (1,000 חיפושים בחודש, בלי כרטיס אשראי), מעתיקים את ה-API key, ומוסיפים עוד Secret בשם TAVILY_KEY באותו מקום → Deploy.
6. שולחים לClaude את הכתובת (https://masa-ai.<משהו>.workers.dev): היא נכנסת ל-js/cloud-config.js ול-CSP ב-index.html.

בדיקה: `node tools/ai-worker/test_worker.mjs`
