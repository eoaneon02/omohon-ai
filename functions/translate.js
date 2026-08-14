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

        // プロンプト定義
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
                model: "gemini-3.6-flash",
                input: prompt,
                response_format: { type: "object" }
            })
        });

        const data = await apiResponse.json();

        if (!apiResponse.ok || data.error) {
            throw new Error(data.error?.message || "Gemini APIとの通信に失敗しました。");
        }

        // Interactions APIの仕様に沿った堅牢なレスポンス抽出 (steps配列からmodel_outputを取得)
        let aiResponseText = "";
        if (Array.isArray(data.steps)) {
            const outputStep = data.steps.find(step => step.type === "model_output") || data.steps[data.steps.length - 1];
            if (outputStep?.content) {
                aiResponseText = outputStep.content.map(c => c.text || "").join("");
            }
        }

        if (!aiResponseText) {
            throw new Error("AIからの応答テキストを抽出できませんでした。");
        }

        // JSON文字列のクレンジングとパース
        const cleanedText = aiResponseText.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanedText);

        // キー名の表記ブレを吸収する堅牢な抽出ロジック（小文字化してマッチング）
        const findKey = (obj, targetKeys) => {
            if (!obj || typeof obj !== 'object') return "";
            const lowerKeys = Object.keys(obj).reduce((acc, k) => ({ ...acc, [k.toLowerCase()]: obj[k] }), {});
            for (const key of targetKeys) {
                if (lowerKeys[key] !== undefined) return lowerKeys[key];
            }
            return "";
        };

        const resultObject = {
            englishName: findKey(parsed, ["englishname", "english_name", "english", "name"]) || foodName,
            description: findKey(parsed, ["description", "desc", "explanation"]) || "",
            phrase: findKey(parsed, ["phrase", "englishphrase", "english_phrase"]) || "",
            phraseJapanese: findKey(parsed, ["phrasejapanese", "phrase_japanese", "japanese_phrase"]) || ""
        };

        return new Response(JSON.stringify(resultObject), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: `サーバー処理エラー: ${error.message}` }), { 
            status: 500, headers: { "Content-Type": "application/json" } 
        });
    }
}
