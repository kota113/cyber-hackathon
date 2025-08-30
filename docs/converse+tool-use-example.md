```typescript
// pnpm add @aws-sdk/client-bedrock-runtime
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({region: process.env.AWS_REGION ?? "us-east-1"});
const modelId = "anthropic.claude-3-5-sonnet-20240620-v1:0"; // 例：対応モデルを選択

// 例ツール：現在気温を返す
async function getWeather(input: { city: string }) {
  // 実際は外部APIにアクセスするなど
  return {city: input.city, tempC: 27.1};
}

export async function chatOnce(userText: string) {
  const toolConfig = {
    tools: [
      {
        toolSpec: {
          name: "getWeather",
          description: "Return current temperature in Celsius for a city.",
          inputSchema: {
            json: {
              type: "object",
              properties: {city: {type: "string"}},
              required: ["city"],
            },
          },
        },
      },
    ],
    // 必要なら toolChoice で強制呼び出しも可: { toolChoice: { tool: { name: "getWeather" } } }
  } as const;

  // Step1: ユーザー発話＋ツール定義を送る
  const messages: ConverseCommandInput["messages"] = [
    {role: "user", content: [{text: userText}]},
  ];
  const res1 = await bedrock.send(new ConverseCommand({modelId, messages, toolConfig}));

  // Step2: ツール要求を抽出（stopReason === "tool_use"）
  const content1 = res1.output?.message?.content ?? [];
  const toolUse = content1.find((b: any) => b.toolUse)?.toolUse as
    | { name: string; input: any; toolUseId: string }
    | undefined;

  if (res1.stopReason === "tool_use" && toolUse) {
    // Step3: ツール実行 → 結果を toolResult として返す（role: "user"）
    const result = await getWeather(toolUse.input);
    const messages2: ConverseCommandInput["messages"] = [
      ...messages,
      res1.output!.message!, // モデルのツール要求を会話に保持
      {
        role: "user",
        content: [
          {
            toolResult: {
              toolUseId: toolUse.toolUseId,
              content: [{json: result}],
            },
          },
        ],
      },
    ];
    const res2 = await bedrock.send(new ConverseCommand({modelId, messages: messages2}));
    return (res2.output?.message?.content ?? [])
      .map((b: any) => b.text)
      .filter(Boolean)
      .join("");
  }

  // ツール不要だった場合はテキストをそのまま
  return (content1 ?? []).map((b: any) => b.text).filter(Boolean).join("");
}

```