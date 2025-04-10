# OpenAI Realtime API Integration for RAG Voice Chat

This document explains how we've integrated OpenAI's Realtime API to add voice chat capabilities to our RAG (Retrieval-Augmented Generation) application.

## Overview

The integration allows users to:
- Choose between text chat or voice chat
- Speak directly to the AI and receive voice responses
- Use the same document context from our RAG system for both text and voice interactions

## Architecture

Our implementation follows these key components:

1. **Backend API Endpoints**:
   - `/api/realtime/session` - Creates a new OpenAI Realtime API session
   - `/api/documents/[documentId]/content` - Fetches document content for voice chat context

2. **Frontend Components**:
   - `useRealtimeVoice` hook - Manages WebRTC connection and voice state
   - ChatInterface integration - Adds voice UI controls

3. **WebRTC Connection**:
   - Direct connection to OpenAI's Realtime API
   - Audio streaming in both directions
   - JSON message exchange via data channel

## How It Works

1. When a user selects a document and activates voice mode:
   - We fetch an ephemeral token from OpenAI via our server
   - We establish a WebRTC connection to OpenAI's Realtime API
   - We retrieve document content from our RAG system
   - We send the document context to OpenAI as part of session instructions

2. During voice conversation:
   - User's voice is streamed directly to OpenAI via WebRTC
   - OpenAI's responses are streamed back as audio
   - The conversation appears in the chat interface like normal text messages

## Setup Requirements

To use this feature, ensure your environment has:

1. OpenAI API key with access to the Realtime API
2. Environment variables:
   ```
   OPENAI_API_KEY=your_api_key
   ```
3. SSL enabled (WebRTC requires secure connections)

## Implementation Details

### API Routes

- `app/api/realtime/session/route.ts` - Creates a Realtime API session token
- `app/api/documents/[documentId]/content/route.ts` - Fetches document content for RAG context

### Utility Functions

- `lib/realtimeConnection.ts` - Handles WebRTC connection setup and messaging
- `lib/hooks/useRealtimeVoice.ts` - React hook for managing voice state

### UI Components

- ChatInterface updates:
  - Voice/Text toggle button
  - Recording controls
  - Status indicators

## Important Notes

1. The Realtime API is billed differently from standard API usage. Monitor your usage to avoid unexpected costs.

2. Voice data is streamed directly from the user's browser to OpenAI. Make sure users are aware of this in your privacy policy.

3. For production use, you may want to add:
   - More robust error handling
   - Reconnection logic
   - Audio level visualization
   - Additional voice settings

## Debugging

- Check browser console for WebRTC connection issues
- Common problems include:
  - Missing microphone permissions
  - Network firewalls blocking WebRTC
  - Expired ephemeral tokens

## References

- [OpenAI Realtime API Documentation](https://platform.openai.com/docs/api-reference/realtime)
- [WebRTC Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

## Next Steps

Future enhancements could include:
- Voice activity detection for better turn-taking
- Multiple voice options
- Voice recording and transcription for offline analysis
- Multi-party conversations 