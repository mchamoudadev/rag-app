import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // Verify authentication token
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    // Get request body (may contain document context)
    const { documentId } = await req.json();

    // Create a new session with OpenAI Realtime API
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview-2024-12-17',
        }),
      });
    } catch (fetchError) {
      console.error('Network error calling OpenAI API:', fetchError);
      return NextResponse.json(
        { error: 'Failed to connect to OpenAI API' },
        { status: 503 }
      );
    }

    if (!response.ok) {
      let errorMessage = 'Failed to create Realtime session';
      try {
        const errorData = await response.json();
        console.error('OpenAI Realtime API error:', errorData);
        
        if (errorData.error?.message) {
          errorMessage = `OpenAI Error: ${errorData.error.message}`;
        }
      } catch (parseError) {
        console.error('Failed to parse error response:', parseError);
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Parse the response data
    let sessionData;
    try {
      sessionData = await response.json();
    } catch (parseError) {
      console.error('Failed to parse session response:', parseError);
      return NextResponse.json(
        { error: 'Invalid response from OpenAI API' },
        { status: 500 }
      );
    }

    // Validate the session data
    if (!sessionData.id || !sessionData.client_secret?.value) {
      console.error('Invalid session data:', sessionData);
      return NextResponse.json(
        { error: 'Invalid session data received from OpenAI' },
        { status: 500 }
      );
    }
    
    // Log for debugging
    console.log('Created Realtime session:', {
      sessionId: sessionData.id,
      documentId,
    });

    // Return the session data to the client
    return NextResponse.json(sessionData);
  } catch (error) {
    console.error('Error creating Realtime session:', error);
    return NextResponse.json(
      { error: 'Failed to create Realtime session: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
} 