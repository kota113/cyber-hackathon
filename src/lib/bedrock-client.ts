import type {ConverseCommandInput, Message, Tool, ToolResultBlock,} from "@aws-sdk/client-bedrock-runtime";
import {BedrockRuntimeClient, ContentBlock, ConverseCommand,} from "@aws-sdk/client-bedrock-runtime";

// Configuration for Bedrock client
export interface BedrockConfig {
  region?: string;
  modelId?: string;
}

// Tool execution result
export interface ToolExecutionResult {
  toolUseId: string;
  result: unknown;
  error?: string;
}

// Conversation message for maintaining context
export interface ConversationMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

/**
 * Bedrock Client Service for LLM Communication
 * Handles Amazon Bedrock integration with Claude models
 */
export class BedrockClientService {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private conversationHistory: ConversationMessage[] = [];

  constructor(config: BedrockConfig = {}) {
    this.client = new BedrockRuntimeClient({
      region: config.region ?? process.env.VITE_AWS_REGION ?? "us-east-1"
    });
    this.modelId = config.modelId ?? "anthropic.claude-3-5-sonnet-20240620-v1:0";
  }

  /**
   * Send a message to the LLM with optional tools
   */
  async converse(
    userMessage: string,
    tools: Tool[] = [],
    systemPrompt?: string
  ): Promise<{
    response: string;
    toolUses: Array<{ name: string; input: unknown; toolUseId: string }>;
    needsToolExecution: boolean;
  }> {
    try {
      // Prepare the conversation input
      const messages: Message[] = [
        ...this.conversationHistory,
        {
          role: "user",
          content: [{text: userMessage}]
        }
      ];

      const input: ConverseCommandInput = {
        modelId: this.modelId,
        messages,
      };

      // Add system prompt if provided
      if (systemPrompt) {
        input.system = [{text: systemPrompt}];
      }

      // Add tools if provided
      if (tools.length > 0) {
        input.toolConfig = {tools};
      }

      console.log(`Sending message to Bedrock: "${userMessage}"`);
      const response = await this.client.send(new ConverseCommand(input));

      // Process the response
      const content = response.output?.message?.content ?? [];
      const textResponses = content
        .filter((block) => 'text' in block && block.text)
        .map((block) => ('text' in block ? block.text : '') || "")
        .join("");

      // Extract tool uses if any
      const toolUses: Array<{ name: string; input: unknown; toolUseId: string }> = [];

      for (const block of content) {
        if ('toolUse' in block && block.toolUse) {
          const toolUse = block.toolUse;
          if (toolUse.name && toolUse.toolUseId) {
            toolUses.push({
              name: toolUse.name,
              input: toolUse.input || {},
              toolUseId: toolUse.toolUseId
            });
          }
        }
      }

      // Update conversation history with user message and assistant response
      this.conversationHistory.push({
        role: "user",
        content: [{text: userMessage}]
      });

      if (response.output?.message) {
        this.conversationHistory.push({
          role: "assistant",
          content: response.output.message.content ?? []
        });
      }

      return {
        response: textResponses,
        toolUses,
        needsToolExecution: response.stopReason === "tool_use" && toolUses.length > 0
      };

    } catch (error) {
      console.error('Bedrock conversation error:', error);
      throw new Error(`LLM conversation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Continue conversation after tool execution
   */
  async continueWithToolResults(toolResults: ToolExecutionResult[]): Promise<string> {
    try {
      // Create tool result content blocks
      const toolResultContent: ContentBlock[] = toolResults.map(result => ({
        toolResult: {
          toolUseId: result.toolUseId,
          content: result.error
            ? [{text: `Error: ${result.error}`}]
            : [{json: result.result}]
        } as ToolResultBlock
      }));

      // Add tool results to conversation
      this.conversationHistory.push({
        role: "user",
        content: toolResultContent
      });

      // Send continuation request
      const input: ConverseCommandInput = {
        modelId: this.modelId,
        messages: this.conversationHistory,
      };

      console.log('Continuing conversation with tool results');
      const response = await this.client.send(new ConverseCommand(input));

      // Extract text response
      const content = response.output?.message?.content ?? [];
      const textResponse = content
        .filter((block) => 'text' in block && block.text)
        .map((block) => ('text' in block ? block.text : '') || "")
        .join("");

      // Update conversation history
      if (response.output?.message) {
        this.conversationHistory.push({
          role: "assistant",
          content: response.output.message.content ?? []
        });
      }

      return textResponse;

    } catch (error) {
      console.error('Tool result continuation error:', error);
      throw new Error(`Tool result processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    console.log('Conversation history cleared');
  }

  /**
   * Get conversation history
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get conversation length (number of messages)
   */
  getConversationLength(): number {
    return this.conversationHistory.length;
  }

  /**
   * Update model configuration
   */
  setModel(modelId: string): void {
    this.modelId = modelId;
    console.log(`Model updated to: ${modelId}`);
  }

  /**
   * Get current model ID
   */
  getModelId(): string {
    return this.modelId;
  }
}

// Export singleton instance
export const bedrockClient = new BedrockClientService();

// Export the class for custom instances
export default BedrockClientService;