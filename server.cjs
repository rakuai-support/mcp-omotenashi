const { Server } = require("@modelcontextprotocol/sdk");
const fetch = require("node-fetch");
const dotenv = require("dotenv");

dotenv.config();

// MCP サーバー初期化
const server = new Server({
  name: "omotenashi-mcp",
  version: "1.0.0",
});

// ツール登録
server.registerTool(
  {
    name: "generateVoice",
    description: "Generate voice audio using existing OmotenashiQR API",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        language: { type: "string" },
        voice_speaker: { type: "string" },
        voice_speed: { type: "number" },
      },
      required: ["content", "language", "voice_speaker"],
    },
    outputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        status: { type: "string" },
      },
      required: ["project_id", "status"],
    },
  },

  async (input, context) => {
    // 認証
    const clientKey =
      context.metadata?.["x-mcp-key"] || context.metadata?.["X-MCP-Key"];

    if (!clientKey || clientKey !== process.env.MCP_API_KEY) {
      return { error: "Unauthorized: Invalid MCP API key" };
    }

    // API URL
    const url = `${process.env.BASE_API_URL}/video/generate-audio`;

    // 既存 API に代理リクエスト
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_token: process.env.ADMIN_SESSION_TOKEN,
        content: input.content,
        language: input.language,
        settings: {
          voice_speaker: input.voice_speaker,
          voice_speed: input.voice_speed || 1.0,
        },
        original_prompt: "ChatGPTアプリ（MCP）経由",
      }),
    });

    const data = await res.json();

    if (!data.success) {
      return { error: "Voice API error", detail: data };
    }

    return {
      project_id: data.data.project_id,
      status: data.data.status,
    };
  }
);

// サーバー起動
server.listen(4000).then(() => {
  console.log("MCP server listening on port 4000");
});
