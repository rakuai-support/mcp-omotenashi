#!/bin/bash
#
# MCP Server 初回セットアップスクリプト
# Usage: ./scripts/setup.sh
#

set -e

# 色付きログ出力
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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
REPO_URL="https://github.com/rakuai-support/mcp-omotenashi.git"
BRANCH="${DEPLOY_BRANCH:-claude/mcp-server-implementation-01SEEjHnNH8HTQemNbf4KTyn}"

log_info "=== MCP Server 初回セットアップ開始 ==="

# Node.jsのバージョン確認
log_info "Node.jsのバージョンを確認中..."
if ! command -v node &> /dev/null; then
    log_error "Node.jsがインストールされていません"
    log_info "Node.js 18以上をインストールしてください"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 18以上が必要です（現在: v$NODE_VERSION）"
    exit 1
fi

log_success "Node.js $(node --version) が使用可能です"

# プロジェクトディレクトリの作成またはクローン
if [ -d "$PROJECT_DIR" ]; then
    log_warning "プロジェクトディレクトリが既に存在します: $PROJECT_DIR"
    cd "$PROJECT_DIR"

    if [ -d .git ]; then
        log_info "既存のGitリポジトリを更新中..."
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    else
        log_error "ディレクトリは存在しますがGitリポジトリではありません"
        exit 1
    fi
else
    log_info "リポジトリをクローン中..."
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    git checkout "$BRANCH"
fi

log_success "リポジトリの準備完了"

# 依存関係のインストール
log_info "依存関係をインストール中..."
npm install

log_success "依存関係のインストール完了"

# .envファイルの確認
if [ ! -f .env ]; then
    log_warning ".env ファイルが存在しません"
    log_info "以下の内容で .env ファイルを作成してください："
    echo ""
    echo "MCP_API_KEY=your-mcp-api-key-here"
    echo "OMOTENASHI_SESSION_TOKEN=your-admin-session-token-here"
    echo "BASE_API_URL=https://omotenashiqr.com"
    echo "MCP_PORT=8001"
    echo ""
    log_info "作成方法: nano .env"
    log_warning "セットアップを完了するには .env ファイルを作成してください"
else
    log_success ".env ファイルが存在します"
fi

# PM2のインストール確認
if ! command -v pm2 &> /dev/null; then
    log_warning "PM2がインストールされていません"
    log_info "PM2をインストールしますか？ (推奨)"
    read -p "インストールする (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "PM2をインストール中..."
        sudo npm install -g pm2
        log_success "PM2のインストール完了"

        log_info "PM2の自動起動を設定中..."
        sudo pm2 startup
        log_info "表示されたコマンドを実行してください（既に実行済みの場合はスキップ）"
    fi
else
    log_success "PM2が使用可能です"
fi

# テスト起動
log_info ""
log_info "サーバーをテスト起動しますか？"
read -p "テスト起動する (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "サーバーをテスト起動中..."
    timeout 5 npm start &
    sleep 3

    if curl -s http://localhost:8001/health > /dev/null; then
        log_success "サーバーのテスト起動成功！"
        pkill -f "node server.mjs" || true
    else
        log_error "サーバーの起動に失敗しました"
        log_info "ログを確認してください"
        pkill -f "node server.mjs" || true
        exit 1
    fi
fi

log_success "=== 初回セットアップ完了 ==="
log_info ""
log_info "次のステップ："
log_info "1. .env ファイルを確認/編集: nano $PROJECT_DIR/.env"
log_info "2. デプロイスクリプトを実行: $PROJECT_DIR/scripts/deploy.sh"
log_info ""
log_info "または、手動で起動："
log_info "  cd $PROJECT_DIR"
log_info "  pm2 start server.mjs --name mcp-omotenashi"
log_info "  pm2 save"
