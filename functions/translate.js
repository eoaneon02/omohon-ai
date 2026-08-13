export async function onRequestPost(context) {
    const requestBody = await context.request.json();
    const foodName = requestBody.foodName || "";
    const ingredients = requestBody.ingredients || "";

    const apiKey = context.env.GEMINI_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: "Cloudflare側に GEMINI_API_KEY が設定されていません" }), { status: 500 });
    }

    const prompt = `あなたは優秀な翻訳家です。日本の飲食店メニューを外国人向けに英語化してください。
    【料理名】${foodName}
    【食材・補足】${ingredients}

    出力は必ず以下のJSONオブジェクト形式（キー名は英字そのまま）で行ってください。
    {
      "englishName": "英語のメニュー表記",
      "description": "英語での料理説明",
      "phrase": "提供時の接客フレーズ(英語)",
      "phraseJapanese": "接客フレーズの日本語訳"
    }`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;

    try {
        const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gemini-3.6-flash",
                input: prompt,
                response_format: { type: "object" }
            })
        });

        const data = await response.json();

        if (data.error) {
            return new Response(JSON.stringify({ error: `Gemini APIエラー: ${data.error.message}` }), { status: 500 });
        }

        // 1. steps から model_output のテキストのみを抽出
        let aiResponseText = "";
        if (data.steps && Array.isArray(data.steps)) {
            for (const step of data.steps) {
                if (step.type === "model_output" && step.content) {
                    for (const c of step.content) {
                        if (c.type === "text" && c.text) {
                            aiResponseText += c.text;
                        }
                    }
                }
            }
        }

        if (!aiResponseText) {
            return new Response(JSON.stringify({ error: `テキスト抽出失敗。生データ: ${JSON.stringify(data)}` }), { status: 500 });
        }

        // 2. 余計な記号を除去してパース
        const cleanedText = aiResponseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        let parsed = {};
        try {
            parsed = JSON.parse(cleanedText);
        } catch (e) {
            return new Response(JSON.stringify({ error: `JSONパース失敗。生テキスト: ${cleanedText}` }), { status: 500 });
        }

        // 3. どんな構造やキー名で返ってきても自動で探し出す関数
        const findKey = (obj, targetKeys) => {
            if (!obj || typeof obj !== 'object') return "";
            for (const key of Object.keys(obj)) {
                if (targetKeys.includes(key.toLowerCase())) return obj[key];
            }
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object') {
                    const found = findKey(obj[key], targetKeys);
                    if (found) return found;
                }
            }
            return "";
        };

        const englishName = findKey(parsed, ["englishname", "english_name", "english", "name", "title"]);
        const description = findKey(parsed, ["description", "desc", "explanation", "details"]);
        const phrase = findKey(parsed, ["phrase", "englishphrase", "english_phrase", "service_phrase"]);
        const phraseJapanese = findKey(parsed, ["phrasejapanese", "phrase_japanese", "japanese_phrase", "japanese"]);

        // もしAIの返したキーが全く特定できない場合は生のJSONを表示して原因特定する
        if (!englishName && !description) {
            return new Response(JSON.stringify({ 
                error: `AIの返したJSONキー構造: ${JSON.stringify(parsed)}` 
            }), { status: 500 });
        }

        const resultObject = {
            englishName: englishName || foodName,
            description: description || "",
            phrase: phrase || "",
            phraseJapanese: phraseJapanese || ""
        };

        return new Response(JSON.stringify(resultObject), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: `通信エラー詳細: ${error.message}` }), { status: 500 });
    }
}
