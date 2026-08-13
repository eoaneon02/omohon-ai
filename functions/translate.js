export async function onRequestPost(context) {
    // フロントエンド（画面）から送られてきた料理名などのデータを受け取る
    const requestBody = await context.request.json();
    const foodName = requestBody.foodName || "";
    const ingredients = requestBody.ingredients || "";

    // Cloudflareに設定した環境変数からAPIキーを呼び出す
    const apiKey = context.env.GEMINI_API_KEY;

    // AIへの指示書（プロンプト）
    const prompt = `あなたは優秀な翻訳家です。日本の飲食店メニューを外国人向けに英語化してください。
    【料理名】${foodName}
    【食材・補足】${ingredients}

    必ず以下のJSON形式のみで出力し、他の文章は一切含めないでください。
    {"englishName": "英語のメニュー名", "description": "英語の簡潔な説明文", "phrase": "提供時の接客フレーズ(英語)", "phraseJapanese": "接客フレーズ(日本語訳)"}`;

    // Gemini APIのURL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        // Geminiにリクエストを送信
        const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" } // JSONで返すように強制
            })
        });

        const data = await response.json();
        const aiResponseText = data.candidates[0].content.parts[0].text;

        // 結果を画面側に返す
        return new Response(aiResponseText, {
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: "API通信エラーが発生しました" }), { status: 500 });
    }
}
