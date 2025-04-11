import { AgentConfig } from '@/types/agent';

export function injectTransferTools(agents: AgentConfig[]): AgentConfig[] {
  return agents.map(agent => {
    if (agent.downstreamAgents && agent.downstreamAgents.length > 0) {
      return {
        ...agent,
        tools: [
          ...agent.tools,
          {
            type: "function",
            function: {
              name: "agent_transfer",
              description: "Transfer the conversation to another agent",
              parameters: {
                type: "object",
                properties: {
                  agent: {
                    type: "string",
                    description: "The name of the agent to transfer to",
                    enum: agent.downstreamAgents.map(a => a.name)
                  }
                },
                required: ["agent"]
              }
            }
          }
        ]
      };
    }
    return agent;
  });
}

export function getAgentByName(agents: AgentConfig[], name: string): AgentConfig | undefined {
  return agents.find(agent => agent.name === name);
} 