import { AgentConfig } from '@/types/agent';

const ragAgent: AgentConfig = {
  name: "rag_assistant",
  publicDescription: "Agent that helps users find information from their documents using RAG.",
  instructions: `
    You are an AI assistant helping users find information from their documents.
    Your role is to answer questions based on the relevant context provided to you via function calls.
    Keep your responses concise, clear, and focused on the user's question.
    If the information isn't in the provided context, acknowledge that and avoid making up information.
    
    When a user asks a question:
    1. Use the search_document function to find relevant information
    2. Analyze the returned context
    3. Provide a clear, accurate answer based on the context
    4. If the context doesn't contain the answer, say so
  `,
  tools: [
    {
      type: "function",
      function: {
        name: "search_document",
        description: "Search for relevant information in the user's document",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to find relevant information"
            }
          },
          required: ["query"]
        }
      }
    }
  ]
};

export default ragAgent; 