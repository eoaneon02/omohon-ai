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

    必ず以下のJSON形式のみで出力してください：
    {"englishName": "英語のメニュー名", "description": "英語の簡潔な説明文", "phrase": "提供時の接客フレーズ(英語)", "phraseJapanese": "接客フレーズ(日本語訳)"}`;

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

        // 1. Interactions API の steps からAIの応答テキストを取り出す
        let aiResponseText = "";
        if (data.steps && Array.isArray(data.steps)) {
            const outputStep = data.steps.find(step => step.type === "model_output") || data.steps[data.steps.length - 1];
            if (outputStep && outputStep.content) {
                aiResponseText = outputStep.content.map(c => c.text || "").join("");
            }
        }

        if (!aiResponseText) {
            return new Response(JSON.stringify({ error: "AIからの応答テキストが取得できませんでした。" }), { status: 500 });
        }

        // 2. ```json などの余計な装飾を除去
        const cleanedText = aiResponseText.replace(/```json/gi, "").replace(/```/g, "").trim();

        // 3. JSONとしてパース
        let parsed = {};
        try {
            parsed = JSON.parse(cleanedText);
        } catch (e) {
            return new Response(JSON.stringify({ error: `JSON解析失敗: ${cleanedText}` }), { status: 500 });
        }

        // 4. キー名の表記ブレ（english_nameなど）を吸収して整形
        const resultObject = {
            englishName: parsed.englishName || parsed.english_name || parsed.english || foodName,
            description: parsed.description || parsed.desc || "",
            phrase: parsed.phrase || parsed.english_phrase || "",
            phraseJapanese: parsed.phraseJapanese || parsed.phrase_japanese || parsed.japanese_phrase || ""
        };

        return new Response(JSON.stringify(resultObject), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: `通信エラー詳細: ${error.message}` }), { status: 500 });
    }
}
