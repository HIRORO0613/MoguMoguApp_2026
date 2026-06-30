/**
 * Gemini API クライアント
 *
 * 仕様書 §7 に従い、systemInstruction と responseSchema を必ず設定する。
 * APIキーはユーザーが発行・IndexedDB に保存 → クライアントから直接呼び出す。
 */

import type { GeminiMealAnalysis } from '../types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// 利用可能なモデル（RPD上限順・多いもの優先）
// Gemini 3.1 Flash Lite: RPD 500/day（最大クォータ）
const MODEL = 'gemini-3.1-flash-lite';

// ---------------------------------------------------------------------------
// 食事解析用定義（仕様書 §7 完全準拠）
// ---------------------------------------------------------------------------

const MEAL_SYSTEM_INSTRUCTION =
  'あなたは優秀な栄養管理士AIです。ユーザーが入力した食事のテキストまたは画像から、食事内容を推定してください。\n' +
  '出力は必ず、指定されたJSONスキーマに厳密に従うこと。マークダウンの装飾（```json など）や、その他の説明文は一切禁止します。純粋なJSON文字列のみを返してください。\n' +
  '判断が難しい場合は、一般的なメニューから数値を推測して埋めてください。';

const MEAL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    mealName: { type: 'string', description: '食事の具体的なメニュー名' },
    calories: { type: 'number', description: '推定総カロリー (kcal)' },
    protein: { type: 'number', description: 'タンパク質 (g)' },
    fat: { type: 'number', description: '脂質 (g)' },
    carb: { type: 'number', description: '炭水化物 (g)' },
    confidence: { type: 'number', description: '推定の自信度 (0.0 から 1.0 の間)' },
  },
  required: ['mealName', 'calories', 'protein', 'fat', 'carb', 'confidence'],
};

// ---------------------------------------------------------------------------
// モグちゃんキャラクター定義
// ---------------------------------------------------------------------------

const MOGU_SYSTEM_INSTRUCTION =
  'あなたはモグちゃんという名前のモグラのキャラクターです。健康管理アプリ「MoguMogu」のAIアシスタントです。\n' +
  '明るく前向きな性格で、語尾は必ず「〜だモグ！」「〜だモグ？」「〜だモグ〜」で終わります。\n' +
  'ユーザーが食事について言及したら、「記録しますか？」と積極的に提案してください。\n' +
  '体重の変化にはやさしく励ましの言葉をかけてください。\n' +
  '返答は200文字以内で、親しみやすく具体的にしてください。';

// ---------------------------------------------------------------------------
// 共通呼び出し
// ---------------------------------------------------------------------------

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
}

async function callGemini(apiKey: string, payload: unknown): Promise<GeminiResponse> {
  const url = `${BASE}/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string; code?: number } };
    const msg = err.error?.message ?? `HTTP ${res.status}`;
    // モデルが存在しない場合のフォールバック案内
    if (res.status === 404) {
      throw new GeminiError(
        `モデル「${MODEL}」が見つかりません。Google AI Studioで利用可能なモデル名を確認してください。`
      );
    }
    if (res.status === 429) {
      throw new GeminiError('Gemini APIの利用上限に達しました。しばらく待ってから再試行してください。');
    }
    throw new GeminiError(msg);
  }
  return res.json() as Promise<GeminiResponse>;
}

function extractText(res: GeminiResponse): string {
  return res.candidates[0]?.content?.parts[0]?.text ?? '';
}

// ---------------------------------------------------------------------------
// 食事解析（Structured Output）
// ---------------------------------------------------------------------------

export interface ImageData {
  /** base64 エンコード済み（data:... プレフィックスなし） */
  base64: string;
  mimeType: string;
}

export async function analyzeMeal(
  apiKey: string,
  userText: string,
  image?: ImageData
): Promise<GeminiMealAnalysis> {
  // テキスト + 画像を組み合わせた parts を構築
  const parts: unknown[] = [];
  if (userText.trim()) {
    parts.push({ text: userText });
  }
  if (image) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  }
  if (parts.length === 0) {
    parts.push({ text: 'この食事を分析してください' });
  }

  const payload = {
    system_instruction: { parts: [{ text: MEAL_SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: MEAL_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };
  const res = await callGemini(apiKey, payload);
  return JSON.parse(extractText(res)) as GeminiMealAnalysis;
}

// ---------------------------------------------------------------------------
// モグちゃんとのチャット
// ---------------------------------------------------------------------------

export interface ChatTurn {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

export async function generateMoguResponse(
  apiKey: string,
  history: ChatTurn[],
  userMessage: string
): Promise<string> {
  const contents: ChatTurn[] = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
  ];
  const payload = {
    system_instruction: { parts: [{ text: MOGU_SYSTEM_INSTRUCTION }] },
    contents,
    generationConfig: { temperature: 0.9, maxOutputTokens: 256 },
  };
  const res = await callGemini(apiKey, payload);
  return extractText(res);
}

// ---------------------------------------------------------------------------
// ダッシュボード向け日次フィードバック（1日1回キャッシュ済み）
// ---------------------------------------------------------------------------

export async function generateDailyFeedback(
  apiKey: string,
  intakeKcal: number,
  burnedKcal: number,
  streakDays: number,
  latestWeight: number | null
): Promise<string> {
  const balance = intakeKcal - burnedKcal;
  const sign = balance >= 0 ? `+${balance}` : `${balance}`;
  const weightPart = latestWeight != null ? `、最新体重${latestWeight}kg` : '';
  const prompt =
    `今日の記録: 摂取${intakeKcal}kcal / 消費${burnedKcal}kcal / 収支${sign}kcal${weightPart}。連続記録${streakDays}日。` +
    'このデータをもとに、モグちゃんらしい一言アドバイスを50文字以内でください。';

  const payload = {
    system_instruction: { parts: [{ text: MOGU_SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 100 },
  };
  const res = await callGemini(apiKey, payload);
  return extractText(res);
}
