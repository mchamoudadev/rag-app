import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { INDEX_NAME, pinecone } from '@/lib/pinecone';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import WebSocket from 'ws';
import Document from '@/models/Document';
import connectDB from '@/lib/mongodb';

// System message template for the AI assistant
const SYSTEM_MESSAGE = `
You are an AI assistant helping users find information from their documents.
Your role is to answer questions based on the relevant context provided to you via function calls.
Keep your responses concise, clear, and focused on the user's question.
If the information isn't in the provided context, acknowledge that and avoid making up information.
`;

// Define the active sessions
const sessions = new Map();

// Event types to log for debugging
const LOG_EVENT_TYPES = [
  'response.content.done',
  'response.done',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
  'response.text.done',
  'conversation.item.input_audio_transcription.completed'
];

export async function GET(req: NextRequest) {
  try {
    // Verify authentication
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return new Response('Missing authentication token', { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return new Response('Invalid authentication token', { status: 401 });
    }

    // In a complete implementation, we would:
    // 1. Set up a websocket server
    // 2. Connect to OpenAI's Realtime API
    // 3. Handle function calling for document retrieval
    // 4. Stream results back to the client

    // Since Next.js App Router doesn't directly support WebSockets in route handlers,
    // we need to use a custom server setup or edge functions
    
    // This would typically be done in a separate server.js file in the root directory
    // For demonstration purposes, here's what the implementation would look like:
    
    return new Response('WebSocket endpoint. To implement, create a custom server.js in your project root.', {
      status: 200,
    });
  } catch (error) {
    console.error('WebSocket error:', error);
    return new Response('Internal Server Error', {
      status: 500,
    });
  }
}

/**
 * Below is what would go in your custom server.js file
 * Next.js doesn't support direct WebSocket handlers in App Router route handlers,
 * so this code should be moved to a custom server.js file
 */

// Sample implementation for the custom server
export function createCustomServer() {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  wss.on('connection', async (ws, req) => {
    console.log('Client connected');
    
    // Parse the URL to get any query parameters (like document IDs)
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const documentId = url.searchParams.get('documentId');
    const userId = url.searchParams.get('userId');
    
    if (!documentId || !userId) {
      ws.send(JSON.stringify({ error: 'Missing documentId or userId' }));
      ws.close();
      return;
    }

    // Create session ID
    const sessionId = `session_${Date.now()}`;
    
    // Initialize session
    let session = {
      transcript: '',
      userId: userId,
      documentId: documentId,
      openAiWs: null,
      openAiWsReady: false
    };
    
    sessions.set(sessionId, session);

    // Initialize OpenAI WebSocket
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });
    
    session.openAiWs = openAiWs;

    // Configure OpenAI session when connection is established
    openAiWs.on('open', () => {
      console.log('Connected to OpenAI Realtime API');
      session.openAiWsReady = true;
      
      // Initialize session with OpenAI
      const sessionUpdate = {
        type: 'session.update',
        session: {
          turn_detection: { type: 'server_vad' },
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          voice: 'alloy',
          instructions: SYSTEM_MESSAGE,
          modalities: ["text", "audio"],
          temperature: 0.7,
          input_audio_transcription: {
            "model": "whisper-1"
          },
          tools: [
            {
              type: "function",
              name: "search_document",
              description: "Search for relevant information in the user's document",
              parameters: {
                type: "object",
                properties: {
                  "query": { "type": "string" }
                },
                required: ["query"]
              }
            }
          ],
          tool_choice: "auto"
        }
      };

      openAiWs.send(JSON.stringify(sessionUpdate));
    });

    // Forward client messages to OpenAI
    ws.on('message', async (message) => {
      try {
        if (!session.openAiWsReady) {
          console.log('OpenAI WebSocket not ready yet');
          return;
        }
        
        const data = JSON.parse(message.toString());
        
        // Handle different message types from client
        if (data.type === 'text') {
          // Handle text message
          const textMessage = {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: data.content }]
            }
          };
          
          openAiWs.send(JSON.stringify(textMessage));
          openAiWs.send(JSON.stringify({ type: 'response.create' }));
          
        } else if (data.type === 'audio') {
          // Handle audio data
          const audioAppend = {
            type: 'input_audio_buffer.append',
            audio: data.audio
          };
          
          openAiWs.send(JSON.stringify(audioAppend));
        }
      } catch (error) {
        console.error('Error processing client message:', error);
      }
    });

    // Process messages from OpenAI and forward to client
    openAiWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());
        
        // Handle different response types from OpenAI
        if (response.type === 'response.audio.delta' && response.delta) {
          // Forward audio chunks directly to client
          ws.send(JSON.stringify({
            type: 'audio',
            audio: response.delta
          }));
        }
        
        // Handle function calling for document search
        if (response.type === 'response.function_call_arguments.done') {
          console.log("Function called:", response);
          
          const functionName = response.name;
          const args = JSON.parse(response.arguments);
          
          if (functionName === 'search_document') {
            const query = args.query;
            
            try {
              // Connect to MongoDB to get document details
              await connectDB();
              
              // Fetch document details
              const document = await Document.findOne({ _id: session.documentId, userId: session.userId });
              
              if (!document) {
                sendFunctionOutput(openAiWs, "Sorry, I couldn't find the document you're referring to.");
                return;
              }
              
              // Initialize embeddings
              const embeddings = new OpenAIEmbeddings({
                openAIApiKey: process.env.OPENAI_API_KEY!,
              });
              
              // Get the index
              const index = pinecone.Index(INDEX_NAME);
              
              // Query Pinecone for relevant chunks
              const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
                pineconeIndex: index,
                namespace: session.userId,
                filter: { documentId: document.pineconeId }
              });
              
              // Retrieve relevant chunks
              const results = await vectorStore.similaritySearch(query, 5);
              
              // Combine chunk contents
              const relevantContent = results
                .map(result => result.pageContent)
                .join('\n\n');
              
              // Return the relevant content to the OpenAI function
              sendFunctionOutput(openAiWs, relevantContent || "I couldn't find relevant information for that query.");
              
            } catch (error) {
              console.error('Error searching document:', error);
              sendFunctionOutput(openAiWs, "I encountered an error while searching the document. Please try again.");
            }
          }
        }
        
        // Log agent responses for transcript
        if (response.type === 'response.done') {
          const agentMessage = response.response.output[0]?.content?.find(content => content.transcript)?.transcript || '';
          if (agentMessage) {
            session.transcript += `Agent: ${agentMessage}\n`;
            console.log(`Agent (${sessionId}): ${agentMessage}`);
          }
        }
        
        // Log user transcription
        if (response.type === 'conversation.item.input_audio_transcription.completed' && response.transcript) {
          const userMessage = response.transcript.trim();
          session.transcript += `User: ${userMessage}\n`;
          console.log(`User (${sessionId}): ${userMessage}`);
        }
        
        // Forward relevant events to client
        if (LOG_EVENT_TYPES.includes(response.type)) {
          ws.send(JSON.stringify(response));
        }
        
      } catch (error) {
        console.error('Error processing OpenAI message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log(`Client disconnected (${sessionId})`);
      
      // Close OpenAI WebSocket
      if (session.openAiWs && session.openAiWsReady) {
        session.openAiWs.close();
      }
      
      // Log transcript
      console.log('Full Transcript:');
      console.log(session.transcript);
      
      // Clean up session
      sessions.delete(sessionId);
    });

    // Handle WebSocket errors
    openAiWs.on('error', (error) => {
      console.error('Error in OpenAI WebSocket:', error);
      ws.send(JSON.stringify({ error: 'Error connecting to OpenAI' }));
    });
  });

  return server;
}

// Helper function to send function output back to OpenAI
function sendFunctionOutput(ws: WebSocket, output: string) {
  const functionOutputEvent = {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      role: "system",
      output: output,
    }
  };
  
  ws.send(JSON.stringify(functionOutputEvent));
  
  // Trigger AI to generate a response based on the function output
  ws.send(JSON.stringify({
    type: "response.create",
    response: {
      modalities: ["text", "audio"],
    }
  }));
} 