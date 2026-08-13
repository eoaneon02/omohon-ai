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

    以下のJSON形式で出力してください：
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

        // Interactions API の steps からモデルの出力結果（type: "model_output"）を取り出す
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

        return new Response(aiResponseText, {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: `通信エラー詳細: ${error.message}` }), { status: 500 });
    }
}
