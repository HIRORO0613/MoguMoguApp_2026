健康管理Webアプリ「MoguMogu」システム仕様書（AI指示用 マスター版 v6）

1. プロジェクト概要

アプリ名: MoguMogu

目的: ユーザーの食事、運動（歩数）、体重を管理し、AIキャラクターとの対話で健康維持をサポートする。

プラットフォーム: Webアプリ（モバイルファースト、PWA・オフラインキャッシュ対応）。

技術スタック: React (Vite/Next.js), Tailwind CSS, Google Apps Script (GAS) API, Googleスプレッドシート。

AIエンジン (Gemini API): サーバー共有制限（Rate Limit）回避のため、ユーザー自身にAPIキーを発行・入力させ、クライアントのIndexedDBに保存して直接実行する。

2. 認証・セキュリティアーキテクチャ

2.1 ログインルールとステートレス認証（JWT）

ユーザー登録・識別:

UserUUID (UUIDv4) をシステム主キーとする。

【重要】LoginIDルール: 3〜32文字、英数字とアンダースコア（_）のみ。保存時およびログイン認証時には必ず小文字化（toLowerCase()）して正規化すること。

パスワードハッシュ化: PBKDF2-HMAC-SHA256 (Iteration: 100000以上, Salt: 16byte以上ランダム) 。

JWTによるセッション管理と失効機構:

GASは環境変数を用いて署名した JWT (有効期限30日) を発行。IndexedDBに保存。

【重要】Refresh条件: JWT残存期限が「7日未満」の場合のみ、POST /api/auth/refresh の実行を許可する。期限切れのJWTはリフレッシュ不可とし、再ログインを要求する。

TokenVersion: Users テーブルの TokenVersion (初期値1) をJWTペイロードに含める。DBと不一致の場合はJWTを無効とする。

2.2 データの簡易暗号化（難読化）とHTTPS

スプレッドシート保存時に共通キー APP_SECRET_KEY でAES等による暗号化を行う。

【重要】暗号化の目的: この暗号化は強固な秘匿を目的としない。フロントエンドに鍵が存在するため、第三者による復号を防ぐものではない。あくまで「管理者がスプレッドシートを直接見た際の可読性低下（難読化）」のみを目的とする。 AIはこの前提で軽量な実装を行うこと。

通信は自動的にHTTPSとなる。

3. UI/UX・機能要件

① ホーム画面（ダッシュボード）の構成

連続記録日数と今日の状況 (最上部): 「🔥 〇〇日連続記録中」というストリーク表示と、「摂取〇〇kcal / 消費〇〇kcal / 収支〇〇kcal」を一番目立つ位置に表示。

モグちゃんのフィードバック: 「今日はあと〇〇kcalだモグ！」等のAIメッセージを表示。

【重要】API節約キャッシュ: フィードバック生成は1日1回のみとし、テキストと日付をIndexedDB等にキャッシュする。日付が変わるまで再生成・再API実行は行わない。

「＋記録する」ボタン (中央): タップ後、「食事」「体重」「運動」を選択するワンストップ入力導線。

② 各種記録機能（保存ルール）

食事: Timestamp（日時）を保持。

運動・歩数: Timestamp（日時）と種別 (ExerciseType: "steps" | "workout" | "running") を保持。歩数Webhook受信時のみ、同一日付の "steps" データを上書き（Update）する。

体重: Timestamp（測定日時）を保持し、追記（Insert）して履歴を残す。（※現在体重はプロフィールではなく、Weightsテーブルで管理する）

③ チャット機能とバッチ削除（負荷対策）

キャラクター「モグちゃん」（モグラ・前向き・語尾「〜だモグ」）によるスマート検知（食事・体重の自動記録UI提示）。

保存・削除ルール: チャットごとの同期時削除はGASの負荷が高いため行わない。GASの Time-driven trigger を用い、「毎日深夜にバッチ処理を実行し、各ユーザーのチャットログが100件を超過している場合、古いものから一括削除する」 運用とする。

4. データスキーマ（スプレッドシート構成）

※GASのタイムゾーンは Asia/Tokyo 固定。全テーブルに RecordID (UUID) を付与。

Users: UserUUID / LoginID (小文字正規化) / PasswordHash (PBKDF2) / Salt / TokenVersion / WebhookToken / CreatedAt

Profiles: RecordID / UserUUID / EncryptedData

Meals: RecordID / UserUUID / Timestamp / EncryptedData

Exercises: RecordID / UserUUID / Timestamp / ExerciseType / EncryptedData

Weights: RecordID / UserUUID / Timestamp / EncryptedData

ChatLogs: RecordID / UserUUID / Timestamp / EncryptedData

5. APIエンドポイント仕様 (フロント ↔ GAS)

認証が必要なエンドポイントは Authorization: Bearer <JWT> を付与。
【重要】GASの負荷対策: 個別のGETリクエストには start_date, end_date を必須とし、最大取得期間は過去365日とする。

【新規追加】 GET /api/dashboard : ホーム画面描画用API。今日（または指定日）の「摂取カロリー、総消費カロリー、最新体重、連続記録日数」などを1回の通信で集約して返す。

POST /api/auth/register : ユーザー登録

POST /api/auth/login : ログイン認証

POST /api/auth/refresh : JWTの有効期限延長（残存7日未満のみ）

POST /api/auth/change-password : パスワード変更 (旧PW確認→PBKDF2再計算→Salt更新→TokenVersionインクリメント)

【変更】 DELETE /api/account : アカウント削除 (誤操作防止のため、リクエストBodyに password を必須とし、検証に成功した場合のみ全データ削除を実行)

GET /api/profile, PUT /api/profile : プロフィール取得/更新

GET /api/meals, POST /api/meals : 食事履歴取得/記録

GET /api/weights, POST /api/weights : 体重履歴取得/記録

GET /api/exercises, POST /api/exercises : 運動履歴取得/記録

POST /api/chat : チャットログ保存

POST /api/webhook : iOSショートカットからの受信 (WebhookToken認証)

6. EncryptedData JSONスキーマ仕様 (暗号化の中身)

AIコーディング時に構造がブレないための厳密な型定義。

Profiles: { "height": 170, "targetWeight": 65, "targetDate": "2026-12-31", "age": 23, "sex": "male", "activityLevel": "normal" } (※現在体重はWeightsで管理するため含めない)

Meals: { "mealName": "ラーメン", "calories": 700, "protein": 20, "fat": 25, "carb": 80 }

Exercises (種別で構造を分ける):

stepsの場合: { "type": "steps", "steps": 10500 }

running/workoutの場合: { "type": "running", "durationMinutes": 45, "caloriesBurned": 300, "memo": "朝のランニング" }

Weights: { "weight": 72.5 }

ChatLogs: { "role": "user" | "assistant", "message": "テキスト" }

7. Gemini API 厳密プロンプト・Structured Output仕様

AI実装時、Gemini APIの呼び出しパラメータには必ず以下の「システムプロンプト」と「JSONスキーマ（responseSchema）」を設定すること。

System Instruction (システムプロンプト):

あなたは優秀な栄養管理士AIです。ユーザーが入力した食事のテキストまたは画像から、食事内容を推定してください。
出力は必ず、指定されたJSONスキーマに厳密に従うこと。マークダウンの装飾（```json など）や、その他の説明文は一切禁止します。純粋なJSON文字列のみを返してください。
判断が難しい場合は、一般的なメニューから数値を推測して埋めてください。



Structured Output JSON Schema:

{
  "type": "object",
  "properties": {
    "mealName": { "type": "string", "description": "食事の具体的なメニュー名" },
    "calories": { "type": "number", "description": "推定総カロリー (kcal)" },
    "protein": { "type": "number", "description": "タンパク質 (g)" },
    "fat": { "type": "number", "description": "脂質 (g)" },
    "carb": { "type": "number", "description": "炭水化物 (g)" },
    "confidence": { "type": "number", "description": "推定の自信度 (0.0 から 1.0 の間)" }
  },
  "required": ["mealName", "calories", "protein", "fat", "carb", "confidence"]
}

