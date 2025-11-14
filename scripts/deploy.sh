#!/bin/bash
#
# MCP Server デプロイスクリプト
# Usage: ./scripts/deploy.sh
#

set -e  # エラーが発生したら停止

# 色付きログ出力
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 設定
PROJECT_DIR="/home/ubuntu/mcp-omotenashi"
BRANCH="${DEPLOY_BRANCH:-claude/mcp-server-implementation-01SEEjHnNH8HTQemNbf4KTyn}"
PM2_APP_NAME="mcp-omotenashi"

log_info "=== MCP Server デプロイ開始 ==="
log_info "プロジェクトディレクトリ: $PROJECT_DIR"
log_info "ブランチ: $BRANCH"

# プロジェクトディレクトリに移動
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "プロジェクトディレクトリが存在しません: $PROJECT_DIR"
    log_error "初回セットアップには setup.sh を実行してください"
    exit 1
fi

cd "$PROJECT_DIR"

# Gitの状態を確認
log_info "Git リポジトリの状態を確認中..."
if [ ! -d .git ]; then
    log_error "Gitリポジトリではありません"
    exit 1
fi

# 変更があれば警告
if [ -n "$(git status --porcelain)" ]; then
    log_warning "未コミットの変更があります："
    git status --short
    read -p "続行しますか？ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "デプロイを中止しました"
        exit 0
    fi
fi

# 最新コードを取得
log_info "最新コードを取得中..."
git fetch origin

# ブランチをチェックアウト
log_info "ブランチ $BRANCH にチェックアウト中..."
git checkout "$BRANCH"

# プル
log_info "最新コードをプル中..."
git pull origin "$BRANCH"

log_success "コードの更新完了"

# .envファイルの確認
if [ ! -f .env ]; then
    log_warning ".env ファイルが存在しません"
    log_info ".env.example から .env を作成してください"
    if [ -f .env.example ]; then
        log_info "  cp .env.example .env"
        log_info "  nano .env  # 環境変数を設定"
    fi
    exit 1
fi

# 依存関係のインストール
log_info "依存関係をインストール中..."
npm install --production

log_success "依存関係のインストール完了"

# PM2が実行中か確認
if pm2 list | grep -q "$PM2_APP_NAME"; then
    log_info "PM2でサーバーを再起動中..."
    pm2 restart "$PM2_APP_NAME"
    log_success "サーバーの再起動完了"
else
    log_info "PM2でサーバーを起動中..."
    pm2 start server.mjs --name "$PM2_APP_NAME"
    pm2 save
    log_success "サーバーの起動完了"
fi

# サーバーの状態を確認
sleep 2
log_info "サーバーの状態を確認中..."
pm2 status "$PM2_APP_NAME"

# ヘルスチェック
log_info "ヘルスチェック中..."
if curl -s http://localhost:8001/health > /dev/null; then
    log_success "ヘルスチェック OK"
    curl -s http://localhost:8001/health | jq '.'
else
    log_error "ヘルスチェック 失敗"
    log_info "ログを確認してください: pm2 logs $PM2_APP_NAME"
    exit 1
fi

log_success "=== デプロイ完了 ==="
log_info ""
log_info "次のコマンドでログを確認できます："
log_info "  pm2 logs $PM2_APP_NAME"
log_info ""
log_info "サーバーの状態確認："
log_info "  pm2 status"
log_info "  curl http://localhost:8001/health"
