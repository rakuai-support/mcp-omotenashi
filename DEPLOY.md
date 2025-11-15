# デプロイ手順

本番環境（Ubuntu VPS `mcp.omotenashiqr.com`）へのデプロイ手順です。

## 最新の機能

- **3つのMCPツール**: `generate_audio`, `generate_video`, `generate_complete_video`
- **15言語対応**: 日本語、英語、中国語、韓国語、タイ語など
- **QRコード生成**: テキストから動画・QRコードまで一括生成
- **503エラーハンドリング**: Google API一時的障害の適切な処理
- **グローバルMCPサーバー**: 全セッションで共有される単一インスタンス

## 前提条件

- Ubuntu VPS へのSSHアクセス
- Node.js 18以上がインストールされていること
- Nginxがインストールされていること
- ドメイン `mcp.omotenashiqr.com` がVPSのIPアドレスに設定されていること

## 1. リポジトリのクローン

```bash
# SSHでサーバーにログイン
ssh ubuntu@mcp.omotenashiqr.com

# ホームディレクトリに移動
cd /home/ubuntu

# リポジトリをクローン（まだない場合）
git clone https://github.com/rakuai-support/mcp-omotenashi.git

# または、既存のリポジトリを更新
cd mcp-omotenashi
git pull origin main
```

## 2. 環境変数の設定

```bash
cd /home/ubuntu/mcp-omotenashi

# .envファイルを作成
nano .env
```

以下の内容を入力：

```env
# MCP Server API Key（generate_complete_videoで使用）
MCP_API_KEY=生成したAPIキー

# おもてなしQR 管理者セッショントークン（既存APIへのリクエスト用）
OMOTENASHI_SESSION_TOKEN=実際のセッショントークン

# 既存APIのベースURL
BASE_API_URL=https://omotenashiqr.com

# MCPサーバーのポート番号（デフォルト: 8001）
MCP_PORT=8001
```

**注意:**
- `MCP_API_KEY`は`generate_complete_video`ツールで使用されます
- `OMOTENASHI_SESSION_TOKEN`は`generate_audio`と`generate_video`で使用されます
- MCPクライアントからの接続は認証不要（ChatGPT Desktop App互換）

**API KEYの生成例:**

```bash
# ランダムなAPI KEYを生成
openssl rand -hex 32
```

保存して終了 (Ctrl+X → Y → Enter)

## 3. 依存関係のインストール

```bash
# Node.jsのバージョン確認（18以上必要）
node --version

# npmのインストール（必要な場合）
sudo apt update
sudo apt install npm -y

# プロジェクトの依存関係をインストール
npm install
```

## 4. ローカルテスト

```bash
# サーバーをフォアグラウンドで起動してテスト
npm start

# 別のターミナルでテスト
curl http://localhost:8001/health
```

正常に動作したら Ctrl+C でサーバーを停止。

## 5. PM2のセットアップ

```bash
# PM2をグローバルにインストール
sudo npm install -g pm2

# MCPサーバーをPM2で起動
pm2 start server.mjs --name mcp-omotenashi

# 起動確認
pm2 status

# ログを確認
pm2 logs mcp-omotenashi

# システム起動時に自動起動するよう設定
pm2 startup
# 表示されたコマンドを実行（sudoコマンド）

# 現在の設定を保存
pm2 save
```

**PM2の基本コマンド:**

```bash
# 起動
pm2 start mcp-omotenashi

# 停止
pm2 stop mcp-omotenashi

# 再起動
pm2 restart mcp-omotenashi

# ログ表示
pm2 logs mcp-omotenashi

# ログのクリア
pm2 flush

# 詳細情報
pm2 info mcp-omotenashi

# PM2の一覧表示
pm2 list
```

## 6. Nginx設定

```bash
# Nginx設定ファイルをコピー
sudo cp /home/ubuntu/mcp-omotenashi/nginx/mcp.omotenashiqr.com /etc/nginx/sites-available/

# シンボリックリンクを作成
sudo ln -s /etc/nginx/sites-available/mcp.omotenashiqr.com /etc/nginx/sites-enabled/

# Nginx設定の構文チェック
sudo nginx -t

# Nginxを再起動
sudo systemctl restart nginx

# Nginxの状態確認
sudo systemctl status nginx
```

## 7. SSL証明書のセットアップ（Let's Encrypt）

```bash
# Certbotのインストール（まだない場合）
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# SSL証明書を取得して自動設定
sudo certbot --nginx -d mcp.omotenashiqr.com

# 証明書の自動更新テスト
sudo certbot renew --dry-run
```

Certbotが自動的にNginx設定を更新し、HTTPSを有効化します。

## 8. ファイアウォール設定（必要な場合）

```bash
# UFWを使用している場合
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
sudo ufw status
```

## 9. 動作確認

### 基本動作確認

```bash
# ヘルスチェック（HTTP）
curl http://mcp.omotenashiqr.com/health

# ヘルスチェック（HTTPS）
curl https://mcp.omotenashiqr.com/health

# MCP初期化テスト
curl -X POST https://mcp.omotenashiqr.com/mcp \
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

### 3つのツールの動作確認

詳細なツールテスト方法はREADME.mdの「ツール仕様」セクションを参照してください。

**利用可能なツール:**
1. `generate_audio` - テキストから音声を生成（4言語対応）
2. `generate_video` - 音声から動画を生成
3. `generate_complete_video` - テキストから動画・QRコードまで一括生成（15言語対応）

## 10. モニタリング

```bash
# PM2のリアルタイムモニタリング
pm2 monit

# サーバーログの監視
pm2 logs mcp-omotenashi --lines 100

# システムリソースの確認
htop

# Nginxのアクセスログ
sudo tail -f /var/log/nginx/access.log

# Nginxのエラーログ
sudo tail -f /var/log/nginx/error.log
```

## 更新手順

コードを更新する場合：

```bash
cd /home/ubuntu/mcp-omotenashi

# 最新コードを取得
git pull origin main

# 依存関係を更新（必要な場合）
npm install

# PM2でサーバーを再起動
pm2 restart mcp-omotenashi

# ログを確認
pm2 logs mcp-omotenashi
```

## トラブルシューティング

### サーバーが起動しない

```bash
# PM2のログを確認
pm2 logs mcp-omotenashi --lines 50

# .envファイルの確認
cat .env

# ポート8001が使用中でないか確認
sudo lsof -i :8001
```

### Nginxエラー

```bash
# Nginx設定のテスト
sudo nginx -t

# Nginxエラーログを確認
sudo tail -n 50 /var/log/nginx/error.log

# Nginxを再起動
sudo systemctl restart nginx
```

### SSL証明書の問題

```bash
# 証明書の確認
sudo certbot certificates

# 証明書の更新
sudo certbot renew

# Nginx設定の確認
sudo cat /etc/nginx/sites-available/mcp.omotenashiqr.com
```

### メモリ不足

```bash
# メモリ使用状況の確認
free -h

# PM2のメモリ使用量を確認
pm2 list

# 必要に応じてスワップを追加
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 503エラー（Google API一時的障害）

Google音声合成APIが一時的に利用できない場合に発生します：

```bash
# サーバーログを確認
pm2 logs mcp-omotenashi --lines 100 | grep "503"

# 数秒〜数分後に再試行してください
# 頻発する場合は、Google APIの状態を確認してください
```

**対処法:**
1. 一時的なエラーなので、数秒後に再試行
2. 頻発する場合は、Google APIのステータスページを確認
3. エラーメッセージには「retry_recommended: true」が含まれます

### 動画生成のタイムアウト

各ツールには適切なタイムアウトが設定されています：

- `generate_audio`: 最大60秒
- `generate_video`: 最大300秒（5分）
- `generate_complete_video`: 最大120秒

```bash
# プロジェクトステータスAPIで状態を確認
curl https://omotenashiqr.com/video/project-status/{project_id}

# タイムアウト後も処理が継続している可能性があります
# サーバーログで詳細を確認
pm2 logs mcp-omotenashi --lines 50
```

**対処法:**
1. `generate_complete_video`がタイムアウトした場合、`generate_audio`と`generate_video`を個別に実行
2. Nginxのタイムアウト設定を確認（600秒推奨）
3. 長い動画の場合は、処理に時間がかかることがあります

## セキュリティ

- `.env` ファイルには絶対に機密情報を含めないでください（Gitにコミット禁止）
- `MCP_API_KEY` は強力なランダム文字列を使用してください
- 定期的に依存関係を更新してください: `npm update`
- サーバーのセキュリティアップデートを適用してください: `sudo apt update && sudo apt upgrade`

## バックアップ

重要なファイル：

- `/home/ubuntu/mcp-omotenashi/.env` - 環境変数（機密情報）
- `/etc/nginx/sites-available/mcp.omotenashiqr.com` - Nginx設定
- PM2設定: `pm2 save` で保存された設定

定期的にバックアップを取ることを推奨します。
