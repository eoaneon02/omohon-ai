export async function onRequestPost(context) {
    try {
        const requestBody = await context.request.json();
        const foodName = requestBody.foodName?.trim() || "";
        const ingredients = requestBody.ingredients?.trim() || "";

        if (!foodName) {
            return new Response(JSON.stringify({ error: "料理名が入力されていません。" }), { 
                status: 400, headers: { "Content-Type": "application/json" } 
            });
        }

        const apiKey = context.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "APIキーが設定されていません。" }), { 
                status: 500, headers: { "Content-Type": "application/json" } 
            });
        }

        // プロンプトに日本語訳の出力指示を追加
        const prompt = `あなたは優秀な翻訳家です。日本の飲食店メニューを外国人向けに英語化してください。
【料理名】${foodName}
【食材・補足】${ingredients}

出力は必ず以下のJSONオブジェクト形式（キー名は英字そのまま）で行ってください。
{
  "englishName": "英語のメニュー表記",
  "englishNameJapanese": "その英語メニュー表記の日本語直訳",
  "description": "英語での料理説明",
  "descriptionJapanese": "その英語での料理説明の日本語直訳",
  "phrase": "提供時の接客フレーズ(英語)",
  "phraseJapanese": "接客フレーズの日本語訳"
}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const apiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await apiResponse.json();

        if (!apiResponse.ok || data.error) {
            throw new Error(data.error?.message || "Gemini APIとの通信に失敗しました。");
        }

        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!aiResponseText) {
            throw new Error(`AIからの応答を取得できませんでした。\nAPIレスポンス: ${JSON.stringify(data)}`);
        }

        const cleanedText = aiResponseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        let parsed;
        try {
            parsed = JSON.parse(cleanedText);
        } catch (e) {
            throw new Error(`AIがJSON以外のテキストを返しました。\n内容: ${cleanedText}`);
        }

        const findKey = (obj, targetKeys) => {
            if (!obj || typeof obj !== 'object') return "";
            const lowerKeys = Object.keys(obj).reduce((acc, k) => ({ ...acc, [k.toLowerCase()]: obj[k] }), {});
            for (const key of targetKeys) {
                if (lowerKeys[key] !== undefined && typeof lowerKeys[key] === 'string') return lowerKeys[key];
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
        // 追加: 料理名の日本語訳を取得
        const englishNameJapanese = findKey(parsed, ["englishnamejapanese", "english_name_japanese", "name_japanese"]) || "";
        
        const description = findKey(parsed, ["description", "desc", "explanation"]) || "";
        // 追加: 料理説明の日本語訳を取得
        const descriptionJapanese = findKey(parsed, ["descriptionjapanese", "description_japanese", "desc_japanese"]) || "";
        
        const phrase = findKey(parsed, ["phrase", "englishphrase", "english_phrase"]) || "";
        const phraseJapanese = findKey(parsed, ["phrasejapanese", "phrase_japanese", "japanese_phrase"]) || "";

        if (!englishName) {
            throw new Error(`JSONから 'englishName' を抽出できませんでした。\nAI出力: ${JSON.stringify(parsed)}`);
        }

        // 取得した日本語訳もフロントエンドへ返す
        return new Response(JSON.stringify({ 
            englishName, 
            englishNameJapanese, 
            description, 
            descriptionJapanese, 
            phrase, 
            phraseJapanese 
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, headers: { "Content-Type": "application/json" } 
        });
    }
}
