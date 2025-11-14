import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';

// 環境変数の読み込み
dotenv.config();

// 環境変数のバリデーション
const requiredEnvVars = ['MCP_API_KEY', 'OMOTENASHI_SESSION_TOKEN', 'BASE_API_URL'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} is not set in .env file`);
    process.exit(1);
  }
}

const MCP_PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 8001;
const MCP_API_KEY = process.env.MCP_API_KEY;
const OMOTENASHI_SESSION_TOKEN = process.env.OMOTENASHI_SESSION_TOKEN;
const BASE_API_URL = process.env.BASE_API_URL;

console.log('=== MCP Server Configuration ===');
console.log(`Port: ${MCP_PORT}`);
console.log(`Base API URL: ${BASE_API_URL}`);
console.log(`API Key: ${MCP_API_KEY.substring(0, 10)}...`);
console.log('================================\n');

/**
 * MCPサーバーのインスタンスを作成
 */
const createMcpServer = () => {
  const server = new McpServer(
    {
      name: 'omotenashi-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  /**
   * 音声生成ツール
   * おもてなしQRの既存API（/api/v2/video/generate-audio）を呼び出す
   */
  server.registerTool(
    'generate_audio',
    {
      title: '音声生成ツール',
      description: 'テキストから音声を生成します（おもてなしQR音声生成API）',
      inputSchema: z.object({
        content: z.string().describe('音声化するテキスト内容'),
        language: z.enum(['ja', 'en', 'zh', 'ko']).default('ja').describe('言語 (ja, en, zh, ko)'),
        voice_speaker: z.string().default('Orus').describe('音声スピーカー名（例: Orus）'),
        voice_speed: z.number().min(0.5).max(2.0).default(1.0).describe('音声速度 (0.5-2.0)'),
      }),
    },
    async ({ content, language, voice_speaker, voice_speed }, extra) => {
      try {
        await server.sendLoggingMessage(
          {
            level: 'info',
            data: `Starting audio generation: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
          },
          extra.sessionId
        );

        // 既存APIのエンドポイント
        const apiUrl = `${BASE_API_URL}/video/generate-audio`;

        // APIリクエストボディ
        const requestBody = {
          session_token: OMOTENASHI_SESSION_TOKEN,
          content: content,
          language: language,
          settings: {
            voice_speaker: voice_speaker,
            voice_speed: voice_speed,
          },
          original_prompt: 'MCP Server経由',
        };

        await server.sendLoggingMessage(
          {
            level: 'debug',
            data: `Calling API: ${apiUrl}`,
          },
          extra.sessionId
        );

        // リクエスト詳細をログ出力
        console.log('[DEBUG] API Request:');
        console.log('  URL:', apiUrl);
        console.log('  Body:', JSON.stringify(requestBody, null, 2));

        // 既存APIを呼び出し
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log('[ERROR] API Response:');
          console.log('  Status:', response.status);
          console.log('  StatusText:', response.statusText);
          console.log('  Body:', errorText);
          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        // APIレスポンスの検証
        if (!data.success) {
          throw new Error(`API returned error: ${JSON.stringify(data)}`);
        }

        // プロジェクトIDを取得
        const projectId = data.data?.project_id;
        if (!projectId) {
          throw new Error('No project_id in response');
        }

        await server.sendLoggingMessage(
          {
            level: 'info',
            data: `Audio generation started. Project ID: ${projectId}`,
          },
          extra.sessionId
        );

        // 🆕 音声ファイル完成を待つ（ステータスAPIポーリング）
        const maxAttempts = 60; // 最大60秒
        const pollInterval = 1000; // 1秒ごと
        let audioFileUrl = null;
        let finalStatus = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          // ステータスAPIを呼び出し
          const statusUrl = `${BASE_API_URL}/video/project-status/${projectId}`;
          const statusResponse = await fetch(statusUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            
            if (statusData.success && statusData.data) {
              const status = statusData.data.status;
              finalStatus = status;

              // 音声完成を確認
              if (status === 'audio_completed' && statusData.data.files?.audio) {
                const audioPath = statusData.data.files.audio;
                audioFileUrl = `https://omotenashiqr.com/${audioPath}`;
                
                await server.sendLoggingMessage(
                  {
                    level: 'info',
                    data: `Audio completed after ${attempt} seconds: ${audioFileUrl}`,
                  },
                  extra.sessionId
                );
                break;
              }
            }
          }

          // まだ完成していない場合は待つ
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
        }

        if (!audioFileUrl) {
          throw new Error(`Audio file not ready after ${maxAttempts} seconds (status: ${finalStatus})`);
        }

        await server.sendLoggingMessage(
          {
            level: 'info',
            data: `Audio generation completed. Project ID: ${projectId}`,
          },
          extra.sessionId
        );

        // MCPクライアントに返すレスポンス
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  project_id: projectId,
                  status: 'audio_completed',
                  audio_url: audioFileUrl,
                  message: '音声生成が完了しました',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        await server.sendLoggingMessage(
          {
            level: 'error',
            data: `Error in generate_audio: ${error.message}`,
          },
          extra.sessionId
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: error.message,
                  message: '音声生成中にエラーが発生しました',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
};

/**
 * Expressアプリケーションのセットアップ
 */
const app = express();

// ミドルウェア
app.use(express.json());
app.use(
  cors({
    origin: '*',
    exposedHeaders: ['Mcp-Session-Id'],
  })
);

// トランスポートマップ（セッションIDごとに管理）
const transports = {};

/**
 * API KEY認証ミドルウェア
 */
const authenticateApiKey = (req, res, next) => {
  // initializeリクエストはAPI KEY不要（セッション確立のため）
  if (req.body && isInitializeRequest(req.body)) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: API key is required (X-API-Key header)',
      },
      id: null,
    });
  }

  if (apiKey !== MCP_API_KEY) {
    return res.status(403).json({
      jsonrpc: '2.0',
      error: {
        code: -32002,
        message: 'Forbidden: Invalid API key',
      },
      id: null,
    });
  }

  next();
};

/**
 * MCP POSTエンドポイント
 */
const mcpPostHandler = async (req, res) => {
  // デバッグ: リクエスト詳細をログ出力
  console.log('[DEBUG] POST /mcp - Headers:', JSON.stringify(req.headers));
  console.log('[DEBUG] POST /mcp - Body:', JSON.stringify(req.body));

  const sessionId = req.headers['mcp-session-id'];

  if (sessionId) {
    console.log(`[MCP] Received request for session: ${sessionId}`);
  } else if (isInitializeRequest(req.body)) {
    console.log('[MCP] Received new initialization request');
  } else {
    console.log('[MCP] Received request without session ID');
  }

  try {
    let transport;

    if (sessionId && transports[sessionId]) {
      // 既存のトランスポートを再利用
      transport = transports[sessionId];
      console.log(`[MCP] Reusing existing transport for session: ${sessionId}`);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // 新規初期化リクエスト
      console.log('[MCP] Creating new transport for initialization');

      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore,
        onsessioninitialized: (sessionId) => {
          console.log(`[MCP] Session initialized with ID: ${sessionId}`);
          transports[sessionId] = transport;
        },
      });

      // クローズ時のクリーンアップ
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.log(`[MCP] Transport closed for session ${sid}`);
          delete transports[sid];
        }
      };

      // MCPサーバーに接続
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else if (sessionId && req.body && req.body.method === 'tools/call') {
      // セッションIDはあるが、サーバーが知らない場合（サーバー再起動後など）
      // 新しいトランスポートを自動作成してセッションを再確立
      console.log('[MCP] Recreating lost transport for session: ' + sessionId);
      console.log('[MCP] This typically happens after server restart');
      
      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,  // 既存のセッションIDを再利用
        eventStore,
        onsessioninitialized: (sid) => {
          console.log('[MCP] Session re-initialized with ID: ' + sid);
          transports[sid] = transport;
        },
      });

      // クローズ時のクリーンアップ
      transport.onclose = () => {
        if (transports[sessionId]) {
          console.log('[MCP] Transport closed for session ' + sessionId);
          delete transports[sessionId];
        }
      };

      // MCPサーバーに接続
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      // 無効なリクエスト
      console.log('[ERROR] Invalid request - No session ID and not an initialize request');
      console.log('[ERROR] Request body:', JSON.stringify(req.body));
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided or not an initialization request',
        },
        id: null,
      });
    }

    // 既存トランスポートでリクエストを処理
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] Error handling request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: error.message,
        },
        id: null,
      });
    }
  }
};

/**
 * MCP GETエンドポイント（SSEストリーム用）
 */
const mcpGetHandler = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  if (!sessionId || !transports[sessionId]) {
    return res.status(400).send('Invalid or missing session ID');
  }

  const lastEventId = req.headers['last-event-id'];
  if (lastEventId) {
    console.log(`[MCP] Client reconnecting with Last-Event-ID: ${lastEventId}`);
  } else {
    console.log(`[MCP] Establishing new SSE stream for session ${sessionId}`);
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

/**
 * MCP DELETEエンドポイント（セッション終了用）
 */
const mcpDeleteHandler = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  if (!sessionId || !transports[sessionId]) {
    return res.status(400).send('Invalid or missing session ID');
  }

  console.log(`[MCP] Received session termination request for session ${sessionId}`);

  try {
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('[MCP] Error handling session termination:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing session termination');
    }
  }
};

// ルート設定（認証なし - ChatGPT Desktop App互換）
app.post('/mcp', mcpPostHandler);
app.get('/mcp', mcpGetHandler);
app.delete('/mcp', mcpDeleteHandler);

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'omotenashi-mcp-server',
    version: '1.0.0',
    uptime: process.uptime(),
    sessions: Object.keys(transports).length,
  });
});

// サーバー起動
app.listen(MCP_PORT, (error) => {
  if (error) {
    console.error('[MCP] Failed to start server:', error);
    process.exit(1);
  }
  console.log(`\n✓ MCP Server is running on port ${MCP_PORT}`);
  console.log(`  - POST endpoint: http://localhost:${MCP_PORT}/mcp`);
  console.log(`  - GET endpoint:  http://localhost:${MCP_PORT}/mcp (SSE stream)`);
  console.log(`  - DELETE endpoint: http://localhost:${MCP_PORT}/mcp (session termination)`);
  console.log(`  - Health check:  http://localhost:${MCP_PORT}/health`);
  console.log('\nServer is ready to accept MCP connections.\n');
});

// シャットダウン処理
process.on('SIGINT', async () => {
  console.log('\n[MCP] Shutting down server...');

  // すべてのアクティブなトランスポートをクローズ
  for (const sessionId in transports) {
    try {
      console.log(`[MCP] Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`[MCP] Error closing transport for session ${sessionId}:`, error);
    }
  }

  console.log('[MCP] Server shutdown complete');
  process.exit(0);
});
