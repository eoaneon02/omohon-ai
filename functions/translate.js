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
    
    必ず以下のJSON形式のみで出力し、他の文章は一切含めないでください。
    {"englishName": "英語のメニュー名", "description": "英語の簡潔な説明文", "phrase": "提供時の接客フレーズ(英語)", "phraseJapanese": "接客フレーズ(日本語訳)"}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();

        if (data.error) {
            return new Response(JSON.stringify({ error: `Gemini APIエラー: ${data.error.message}` }), { status: 500 });
        }

        const aiResponseText = data.candidates[0].content.parts[0].text;

        return new Response(aiResponseText, {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: `通信エラー詳細: ${error.message}` }), { status: 500 });
    }
}
