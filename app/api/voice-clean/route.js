export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { text } = await req.json();
    if (!text || !text.trim()) {
      return Response.json({ error: "内容が空です" }, { status: 400 });
    }

    const prompt = `以下は、スタッフが音声入力で話した内容をそのまま文字起こししたものです。音声認識特有の誤字脱字や不自然な変換が含まれている可能性があります。

これを読み取り、以下の対応をしてください。
- 明らかな誤字脱字・誤変換を、話の内容から推測して自然に修正する
- 「えーと」「あの」などのフィラー（言い淀み）を取り除く
- 話し言葉として不自然な箇所を、意味を変えずに自然な日本語の文章に整える
- 内容の要約・省略はせず、話していた情報はすべて残す

出力は、整えられた文章のみとしてください。前置きや説明、見出し、鍵カッコなどは一切不要です。

【元のテキスト】
${text}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "添削に失敗しました" }, { status: 500 });
    }
    const cleaned = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return Response.json({ text: cleaned || text });
  } catch (e) {
    return Response.json({ error: e.message || "添削に失敗しました" }, { status: 500 });
  }
}
