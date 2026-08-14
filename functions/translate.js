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

        // 正しい Gemini API エンドポイント (generateContent)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
        
        const apiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    // AIに必ずJSON形式で出力させるための公式設定
                    responseMimeType: "application/json"
                }
            })
        });

        const data = await apiResponse.json();

        if (!apiResponse.ok || data.error) {
            throw new Error(data.error?.message || "Gemini APIとの通信に失敗しました。");
        }

        // generateContent の仕様に沿ったデータ抽出
        let aiResponseText = "";
        if (data.candidates && data.candidates[0]?.content?.parts) {
            aiResponseText = data.candidates[0].content.parts.map(p => p.text || "").join("");
        }

        if (!aiResponseText || aiResponseText === "{}") {
            throw new Error(`AIからの応答が空でした。\n生データ: ${JSON.stringify(data)}`);
        }

        // JSON文字列のパース
        let parsed;
        try {
            parsed = JSON.parse(aiResponseText);
        } catch (e) {
            throw new Error(`AIがJSON以外のテキストを返しました。\n内容: ${aiResponseText}`);
        }

        // どんな階層にキーがあっても探し出す再帰関数
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
        
        if (!englishName) {
            throw new Error(`JSONから 'englishName' を抽出できませんでした。\nAIの実際の出力データ: ${JSON.stringify(parsed)}`);
        }

        const description = findKey(parsed, ["description", "desc", "explanation"]) || "";
        const phrase = findKey(parsed, ["phrase", "englishphrase", "english_phrase"]) || "";
        const phraseJapanese = findKey(parsed, ["phrasejapanese", "phrase_japanese", "japanese_phrase"]) || "";

        const resultObject = { englishName, description, phrase, phraseJapanese };

        return new Response(JSON.stringify(resultObject), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, headers: { "Content-Type": "application/json" } 
        });
    }
}
