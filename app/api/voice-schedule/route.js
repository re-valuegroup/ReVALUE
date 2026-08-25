export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { transcript, full } = await req.json();
    if (!transcript || !transcript.trim()) {
      return Response.json({ error: "音声の内容が空です" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const basicFields = `{
  "startDate": "開始日（YYYY-MM-DD形式。「今日」「明日」「来週の月曜」などは今日の日付を基準に計算）",
  "endDate": "終了日（YYYY-MM-DD形式。単日の場合はstartDateと同じ日、または省略）",
  "startTime": "開始時刻（HH:MM形式・24時間表記。話に出てきた場合のみ）",
  "endTime": "終了時刻（HH:MM形式・24時間表記。話に出てきた場合のみ）"
}`;

    const fullFields = `{
  "type": "予定の種別。撮影の予定であれば shoot、編集の予定であれば edit",
  "editTask": "編集の場合の工程。カットなら cut、テロップなら telop、アニメーション・演出なら animation、効果音・BGMなら sfx、まとめてなら all",
  "staffName": "担当者の名前（話に出てきた場合のみ）",
  "staffNameReading": "staffNameのひらがな読み（漢字変換が誤っている可能性があるため、聞こえた音そのものをひらがなで）",
  "startDate": "開始日（YYYY-MM-DD形式。「今日」「明日」「来週の月曜」などは今日の日付を基準に計算）",
  "endDate": "終了日（YYYY-MM-DD形式。単日の場合はstartDateと同じ日、または省略）",
  "startTime": "開始時刻（HH:MM形式・24時間表記。話に出てきた場合のみ）",
  "endTime": "終了時刻（HH:MM形式・24時間表記。話に出てきた場合のみ）",
  "note": "その他の補足・メモ（話に出てきた場合のみ）"
}`;

    const prompt = `あなたはSNS運用代行会社の動画制作管理システムのアシスタントです。以下は、スタッフが音声入力で話した、スケジュール登録に関する内容の文字起こしです。この内容を読み取り、予定の管理項目に振り分けてください。

今日の日付: ${today}（相対的な日付表現はこの日付を基準に西暦の YYYY-MM-DD 形式に変換してください）

音声の文字起こし:
「${transcript}」

以下のJSON形式で、話の中に出てきた項目だけを埋めて出力してください。触れられていない項目はキー自体を含めないでください（空文字列を入れないでください）。前置きや説明、コードブロックの記号は一切使わず、JSONオブジェクトのみを出力してください。

${full ? fullFields : basicFields}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data?.error?.message || "振り分けに失敗しました" }, { status: 500 });
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let fields;
    try {
      fields = JSON.parse(cleaned);
    } catch (e) {
      return Response.json({ error: "AIの応答をうまく読み取れませんでした。もう一度お試しください。" }, { status: 500 });
    }

    return Response.json({ fields });
  } catch (e) {
    return Response.json({ error: e.message || "振り分けに失敗しました" }, { status: 500 });
  }
}
