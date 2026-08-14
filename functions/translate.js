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

        // Gemini Interactions API エンドポイント
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
        
        const apiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "gemini-2.0-flash", // 安定稼働モデル
                input: prompt,
                response_format: { type: "object" }
            })
        });

        const data = await apiResponse.json();

        if (!apiResponse.ok || data.error) {
            throw new Error(data.error?.message || "Gemini APIとの通信に失敗しました。");
        }

        // 1. データの抽出 (Interactions形式 と 従来形式 の両方に自動対応)
        let aiResponseText = "";
        
        if (Array.isArray(data.steps)) {
            const outputStep = data.steps.find(step => step.type === "model_output") || data.steps[data.steps.length - 1];
            if (outputStep?.content) {
                aiResponseText = outputStep.content.map(c => c.text || "").join("");
            }
        } else if (data.candidates && data.candidates[0]?.content?.parts) {
            // Interactionsが従来形式で返却した場合の保険
            aiResponseText = data.candidates[0].content.parts.map(p => p.text || "").join("");
        }

        if (!aiResponseText) {
            throw new Error(`AIからの応答テキストを抽出できませんでした。\n生データ: ${JSON.stringify(data).substring(0, 300)}...`);
        }

        // 2. JSON文字列のクレンジングとパース
        const cleanedText = aiResponseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        let parsed;
        try {
            parsed = JSON.parse(cleanedText);
        } catch (e) {
            throw new Error(`AIがJSON以外のテキストを返しました。\n内容: ${cleanedText}`);
        }

        // 3. どんな階層にキーがあっても探し出す強力な再帰関数
        const findKey = (obj, targetKeys) => {
            if (!obj || typeof obj !== 'object') return "";
            
            // 現在の階層をチェック
            const lowerKeys = Object.keys(obj).reduce((acc, k) => ({ ...acc, [k.toLowerCase()]: obj[k] }), {});
            for (const key of targetKeys) {
                if (lowerKeys[key] !== undefined && typeof lowerKeys[key] === 'string') return lowerKeys[key];
            }
            
            // 子オブジェクトの中を再帰的にチェック
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object') {
                    const found = findKey(obj[key], targetKeys);
                    if (found) return found;
                }
            }
            return "";
        };

        const englishName = findKey(parsed, ["englishname", "english_name", "english", "name", "title"]);
        
        // 4. 抽出失敗時はサイレントエラーにせず、中身を画面に出力して原因を特定する
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
