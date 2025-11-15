# おもてなしQR MCP Server

ChatGPTなどのMCP対応クライアントから、おもてなしQRの音声・動画生成APIを呼び出すためのMCPサーバーです。

## 概要

このMCPサーバーは、Model Context Protocol (MCP) に準拠したAPIゲートウェイとして機能し、MCPクライアントからのリクエストを既存のおもてなしQR音声・動画生成APIにプロキシします。

### アーキテクチャ

```
ChatGPT（MCPクライアント）
        │ （認証なし - ChatGPT Desktop App互換）
        ▼
mcp.omotenashiqr.com（Node MCPサーバー）
        │ （内部固定 session_token / mcp_api_key）
        ▼
omotenashiqr.com/video/generate-audio（既存API）
omotenashiqr.com/video/generate-video（既存API）
omotenashiqr.com/mcp/generate-complete-video（既存API）
```

## 機能

- **MCP準拠**: Model Context Protocol 2024-11-05 に準拠
- **3つのツール**: `generate_audio`, `generate_video`, `generate_complete_video` を提供
- **15言語対応**: 日本語、英語、中国語、韓国語、タイ語など15言語に対応（`generate_complete_video`）
- **音声生成**: テキストから音声ファイルを生成（最大60秒ポーリング）
- **動画生成**: 音声から背景画像付き動画を生成（最大300秒ポーリング）
- **QRコード一括生成**: テキストから動画・QRコードまで一括生成（120秒タイムアウト）
- **エラーハンドリング**: 503エラー（Google API一時的障害）の適切な処理
- **セッション管理**: StreamableHTTP transportを使用したセッション管理
- **グローバルサーバー**: 全セッションで共有される単一のMCPサーバーインスタンス
- **ロギング**: 詳細なログ出力で動作を追跡

## 必要な環境

- Node.js 18以上
- npm または yarn

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env` ファイルを作成し、以下の環境変数を設定します：

```env
# MCP Server API Key（generate_complete_videoで使用）
MCP_API_KEY=your-mcp-api-key-here

# おもてなしQR 管理者セッショントークン（既存APIへのリクエスト用）
OMOTENASHI_SESSION_TOKEN=your-admin-session-token-here

# 既存APIのベースURL
BASE_API_URL=https://omotenashiqr.com

# MCPサーバーのポート番号（デフォルト: 8001）
MCP_PORT=8001
```

### 3. サーバーの起動

```bash
npm start
```

サーバーが起動すると、以下のエンドポイントが利用可能になります：

- `POST /mcp` - MCPリクエストエンドポイント
- `GET /mcp` - SSEストリームエンドポイント
- `DELETE /mcp` - セッション終了エンドポイント
- `GET /health` - ヘルスチェックエンドポイント

## 使用方法

### ヘルスチェック

```bash
curl http://localhost:8001/health
```

### MCP初期化

```bash
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

レスポンスヘッダーから `Mcp-Session-Id` を取得してください。

### ツールリストの取得

```bash
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

## ツール仕様

### 1. `generate_audio`

テキストから音声を生成します（4言語対応）。

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|------|------|-----------|------|
| `content` | string | ✓ | - | 音声化するテキスト内容 |
| `language` | enum | | `ja` | 言語 (`ja`, `en`, `zh`, `ko`) |
| `voice_speaker` | string | | `Orus` | 音声スピーカー名 |
| `voice_speed` | number | | `1.0` | 音声速度 (0.5-2.0) |

**レスポンス例:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "{
  \"success\": true,
  \"project_id\": \"abc123\",
  \"audio_path\": \"outputs/abc123/audio.mp3\",
  \"audio_url\": \"https://omotenashiqr.com/outputs/abc123/audio.mp3\",
  \"status\": \"audio_completed\",
  \"message\": \"音声生成が正常に完了しました\",
  \"note\": \"動画を生成するには、generate_videoツールでこのaudio_pathを使用してください\"
}"
    }
  ]
}
```

**呼び出し例:**

```bash
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "generate_audio",
      "arguments": {
        "content": "こんにちは、世界",
        "language": "ja",
        "voice_speaker": "Orus",
        "voice_speed": 1.0
      }
    },
    "id": 3
  }'
```

### 2. `generate_video`

音声ファイルから背景画像付き動画を生成します。

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|------|------|-----------|------|
| `project_id` | string | ✓ | - | プロジェクトID（音声生成で取得したID） |
| `audio_path` | string | ✓ | - | 音声ファイルパス（音声生成で取得したパス） |
| `background_type` | enum | | `default` | 背景タイプ (`default`, `custom`) |
| `custom_image` | string | | - | カスタム背景画像（ファイル名、`background_type=custom`の場合のみ） |
| `use_bgm` | boolean | | `false` | BGMを使用するか |
| `use_subtitles` | boolean | | `true` | 字幕を表示するか |
| `use_vertical_video` | boolean | | `false` | 縦動画（1080x1920）にするか |

**レスポンス例:**

```json
{
  "content": [
    {
      "type": "text",
      "text": "{
  \"success\": true,
  \"project_id\": \"abc123\",
  \"video_url\": \"https://omotenashiqr.com/outputs/abc123/video.mp4\",
  \"short_url\": \"https://omotenashiqr.com/v/xyz789\",
  \"message\": \"動画生成が正常に完了しました\"
}"
    }
  ]
}
```

**呼び出し例:**

```bash
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "generate_video",
      "arguments": {
        "project_id": "abc123",
        "audio_path": "outputs/abc123/audio.mp3",
        "background_type": "default",
        "use_bgm": false,
        "use_subtitles": true,
        "use_vertical_video": false
      }
    },
    "id": 4
  }'
```

### 3. `generate_complete_video`

テキストから音声生成・動画生成・ストレージアップロード・QRコード生成まで一括実行します（15言語対応）。

**パラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|------------|------|------|-----------|------|
| `text` | string | ✓ | - | 動画にするテキスト内容 |
| `language` | enum | | `ja` | 言語コード（15言語対応） |
| `title` | string | | - | 動画タイトル（省略時は自動生成） |
| `description` | string | | - | 動画説明文（省略時はデフォルト値） |
| `tags` | array | | - | 動画タグ（配列） |
| `is_public` | boolean | | `true` | 動画を公開するか |
| `use_bgm` | boolean | | `false` | BGMを使用するか |
| `use_subtitles` | boolean | | `true` | 字幕を表示するか |
| `use_vertical_video` | boolean | | `false` | 縦動画（1080x1920）にするか |
| `image_urls` | array | | - | 背景画像URL（複数対応・将来拡張用） |
| `mcp_user_id` | string | | `38` | MCPユーザーID |

**対応言語（15言語）:**

`ja`, `en`, `zh`, `zh-TW`, `ko`, `th`, `es`, `it`, `fr`, `de`, `ru`, `ms`, `id`, `vi`, `fil`

**レスポンス例:**

テキストとQRコード画像（Base64）を返します。

```json
{
  "content": [
    {
      "type": "text",
      "text": "動画生成完了！\n\nプロジェクトID: abc123\nvideo_id: 456\n\n短縮URL: https://omotenashiqr.com/v/xyz789\n短縮コード: xyz789\n\n動画URL: https://omotenashiqr.com/outputs/abc123/video.mp4\n音声URL: https://omotenashiqr.com/outputs/abc123/audio.mp3\n\nタイトル: テスト動画\n説明: テスト説明\n言語: ja\n音声時間: 5秒\nファイルサイズ: 123456 bytes\n画像枚数: 1枚\n\nQRコード: Base64データ（12345文字）\n\nスマートフォンでQRコードをスキャンすると動画が再生されます。"
    },
    {
      "type": "image",
      "data": "iVBORw0KGgoAAAANSUhEUgAA...",
      "mimeType": "image/png"
    }
  ]
}
```

**呼び出し例:**

```bash
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "generate_complete_video",
      "arguments": {
        "text": "こんにちは、世界",
        "language": "ja",
        "title": "テスト動画",
        "description": "これはテスト動画です",
        "tags": ["テスト", "MCP"],
        "is_public": true,
        "use_bgm": false,
        "use_subtitles": true,
        "use_vertical_video": false
      }
    },
    "id": 5
  }'
```

## エラーハンドリング

### 503エラー（Google API一時的障害）

Google音声合成APIが一時的に利用できない場合、適切なエラーメッセージを返します：

```json
{
  "success": false,
  "error": "Google音声合成APIが一時的に利用できません。数秒後に再試行してください。(503 Service Unavailable)",
  "error_type": "temporary",
  "retry_recommended": true,
  "message": "音声生成中にエラーが発生しました",
  "troubleshooting": "一時的なエラーです。数秒後に再試行してください。"
}
```

### タイムアウトエラー

各ツールには適切なタイムアウトが設定されています：

- `generate_audio`: 最大60秒
- `generate_video`: 最大300秒（5分）
- `generate_complete_video`: 最大120秒

## Nginx リバースプロキシ設定

本番環境では、Nginxをリバースプロキシとして使用することを推奨します。

設定例（`/etc/nginx/sites-available/mcp.omotenashiqr.com`）：

```nginx
server {
    listen 80;
    server_name mcp.omotenashiqr.com;

    location / {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;

        # WebSocket/SSE対応
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # ヘッダー転送
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # タイムアウト設定（動画生成を考慮）
        proxy_read_timeout 600;
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
    }
}
```

SSL設定（Let's Encrypt）：

```bash
sudo certbot --nginx -d mcp.omotenashiqr.com
```

## PM2による常駐化（推奨）

本番環境では、PM2を使用してサーバーを常駐させることを推奨します：

```bash
# PM2のインストール
npm install -g pm2

# サーバーの起動
pm2 start server.mjs --name mcp-omotenashi

# 自動起動設定
pm2 startup
pm2 save

# ログの確認
pm2 logs mcp-omotenashi
```

## トラブルシューティング

### サーバーが起動しない

1. 環境変数が正しく設定されているか確認してください
2. ポート8001が使用可能か確認してください：`lsof -i :8001`
3. Node.jsのバージョンを確認してください：`node --version` (18以上必要)

### API呼び出しでエラーが発生する

1. `OMOTENASHI_SESSION_TOKEN` が有効か確認してください
2. `BASE_API_URL` が正しいか確認してください
3. サーバーログを確認してください：ログには詳細なエラー情報が出力されます

### 503エラーが頻発する

Google音声合成APIが一時的に利用できない状態です。数秒〜数分後に再試行してください。

### 動画生成がタイムアウトする

- `generate_video`: 300秒（5分）を超える場合はタイムアウトします
- `generate_complete_video`: 120秒（2分）を超える場合はタイムアウトします
- プロジェクトステータスAPIで状態を確認してください

## 開発

### ローカル開発

```bash
# サーバーを起動（開発モード）
npm start

# 別のターミナルでテスト
curl http://localhost:8001/health
```

### ログレベル

サーバーは以下のログレベルでメッセージを出力します：

- `info`: 通常の操作情報
- `debug`: デバッグ情報（API呼び出し詳細など）
- `error`: エラー情報

## セキュリティ

- **API KEY認証**: 現在は無効化されています（ChatGPT Desktop App互換のため）
- **セッション管理**: 各クライアントに固有のセッションIDが割り当てられます
- **環境変数**: 機密情報は`.env`ファイルで管理（Gitにコミットしない）
- **内部認証**: `OMOTENASHI_SESSION_TOKEN`と`MCP_API_KEY`は環境変数で管理

## アーキテクチャ詳細

### グローバルMCPサーバーインスタンス

全セッションで単一のMCPサーバーインスタンス（`globalMcpServer`）を共有します。これにより、ツールの重複登録エラーを防ぎます。

### ファイルシステム操作

`generate_video`ツールでは、背景画像をプロジェクトフォルダに直接保存します：

```
/home/ubuntu/omotenashiqr_production/outputs/{project_id}/{timestamp}_default_background.jpg
```

将来的には、本体側のAPI拡張（`project_id`対応のアップロードエンドポイント）で改善予定です。

## ライセンス

ISC

## 作者

おもてなしQR開発チーム
