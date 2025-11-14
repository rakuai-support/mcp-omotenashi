# おもてなしQR MCP Server

ChatGPTなどのMCP対応クライアントから、おもてなしQRの音声生成APIを呼び出すための最小構成MCPサーバーです。

## 概要

このMCPサーバーは、Model Context Protocol (MCP) に準拠したAPIゲートウェイとして機能し、MCPクライアントからのリクエストを既存のおもてなしQR音声生成APIにプロキシします。

### アーキテクチャ

```
ChatGPT（MCPクライアント）
        │ （MCP API KEY 認証）
        ▼
mcp.omotenashiqr.com（Node MCPサーバー）
        │ （内部固定 session_token）
        ▼
omotenashiqr.com/api/v2/video/generate-audio（既存API）
```

## 機能

- **MCP準拠**: Model Context Protocol 2024-11-05 に準拠
- **API KEY認証**: MCPクライアントからのリクエストをAPI KEYで認証
- **音声生成ツール**: `generate_audio` ツールを提供
- **セッション管理**: StreamableHTTP transportを使用したセッション管理
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
# MCP Server API Key (MCPクライアントからのリクエスト認証用)
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
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

### 音声生成ツールの実行

```bash
curl -X POST http://localhost:8001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -H "X-API-Key: YOUR_API_KEY" \
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

## ツール仕様

### `generate_audio`

テキストから音声を生成します。

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
      "text": "{\"success\": true, \"project_id\": \"...\", \"status\": \"...\", ...}"
    }
  ]
}
```

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

        # タイムアウト設定
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
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

- **API KEY認証**: すべてのMCPリクエスト（初期化を除く）には`X-API-Key`ヘッダーが必要
- **セッション管理**: 各クライアントに固有のセッションIDが割り当てられます
- **環境変数**: 機密情報は`.env`ファイルで管理（Gitにコミットしない）

## ライセンス

ISC

## 作者

おもてなしQR開発チーム
