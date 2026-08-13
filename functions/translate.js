export async function onRequestPost(context) {
    try {
        // リクエストボディの取得
        const requestBody = await context.request.json();
        const foodName = requestBody.foodName || "";
        const ingredients = requestBody.ingredients || "";

        if (!foodName) {
            return new Response(JSON.stringify({ error: "料理名が入力されていません。" }), { 
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const apiKey = context.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Cloudflare側に GEMINI_API_KEY が設定されていません。" }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        // プロンプトの定義
        const prompt = `あなたは優秀な翻訳家です。日本の飲食店メニューを外国人向けに英語化してください。
【料理名】${foodName}
【食材・補足】${ingredients}

必ず以下のJSONフォーマットのみで出力してください（マークダウンのバッククォートなども含めず、純粋なJSON文字列のみを返してください）：
{
  "englishName": "英語のメニュー表記",
  "description": "英語での簡潔な料理説明",
  "phrase": "提供時の接客フレーズ(英語)",
  "phraseJapanese": "接客フレーズの日本語訳"
}`;

        // 安定版のエンドポイント（gemini-2.0-flash）
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

        const apiResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    // APIレベルでJSON出力を強制する最新仕様
                    response_mime_type: "application/json",
                    temperature: 0.3
                }
            })
        });

        const data = await apiResponse.json();

        // API側からのエラーチェック
        if (data.error) {
            return new Response(JSON.stringify({ error: `Gemini APIエラー: ${data.error.message}` }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        // レスポンスからテキストを安全に抽出
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
            return new Response(JSON.stringify({ error: "AIからの応答テキストが空でした。" }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        // マークダウンや余計な空白を徹底的に除去してパース
        const cleanedText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
        
        let parsedJson;
        try {
            parsedJson = JSON.parse(cleanedText);
        } catch (parseError) {
            return new Response(JSON.stringify({ error: `JSONパースエラー: ${cleanedText}` }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        // データの整合性を保ちつつオブジェクトを構築（フォールバック付き）
        const resultObject = {
            englishName: parsedJson.englishName || parsedJson.english_name || foodName,
            description: parsedJson.description || parsedJson.desc || "",
            phrase: parsedJson.phrase || "",
            phraseJapanese: parsedJson.phraseJapanese || parsedJson.phrase_japanese || ""
        };

        return new Response(JSON.stringify(resultObject), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: `サーバー内部エラー: ${error.message}` }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
