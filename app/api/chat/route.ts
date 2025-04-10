import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Chat from '@/models/Chat';
import { verifyToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify the token and get user ID
    const userData = await verifyToken(token);
    if (!userData || !userData.userId) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const { messages, documentId } = await req.json();
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Find existing chat or create new one
    let chat = await Chat.findOne({ documentId, userId: userData.userId });
    if (!chat) {
      chat = new Chat({
        documentId,
        userId: userData.userId,
        messages: []
      });
    }

    // Update messages
    chat.messages = messages;
    await chat.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving chat:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save chat' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify the token and get user ID
    const userData = await verifyToken(token);
    if (!userData || !userData.userId) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const documentId = req.nextUrl.searchParams.get('documentId');
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const chat = await Chat.findOne({ documentId, userId: userData.userId });
    
    if (!chat) {
      return NextResponse.json({ messages: [] }, { status: 200 });
    }
    
    return NextResponse.json({ messages: chat.messages || [] });
  } catch (error: any) {
    console.error('Error fetching chat:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch chat' },
      { status: 500 }
    );
  }
} 