import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { INDEX_NAME } from '@/lib/pinecone';
import { verifyToken } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';

export async function GET(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
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

    console.log("params", params);

    // Next.js requires awaiting params in newer versions
    const { documentId } = await params;
    if (!documentId) {
      return NextResponse.json({ error: 'Missing document ID' }, { status: 400 });
    }

    // Connect to MongoDB
    await connectDB();

    // Fetch document details
    const document = await Document.findOne({ _id: documentId, userId: payload.userId });
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    // Get the index
    const index = pinecone.Index(INDEX_NAME);
    
    // Initialize embeddings
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });
    
    // Query Pinecone for all document chunks
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: payload.userId,
      filter: { documentId: document.pineconeId }
    });
    
    // Retrieve all chunks
    const results = await vectorStore.similaritySearch('', 50); // Get up to 50 chunks with empty query
    
    // Combine all chunk contents
    const combinedContent = results
      .map(result => result.pageContent)
      .join('\n\n');
    
    // Return the content
    return NextResponse.json({
      content: combinedContent,
      documentType: document.type,
      documentName: document.fileName
    });
  } catch (error) {
    console.error('Error fetching document content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document content' },
      { status: 500 }
    );
  }
} 