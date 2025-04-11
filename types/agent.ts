export interface AgentConfig {
  name: string;
  publicDescription: string;
  instructions: string;
  tools: Tool[];
  downstreamAgents?: AgentConfig[];
}

export interface Tool {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, {
        type: string;
        description: string;
      }>;
      required: string[];
    };
  };
} 