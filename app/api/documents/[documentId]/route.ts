import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '@/lib/aws';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { Pinecone } from '@pinecone-database/pinecone';
import { INDEX_NAME } from '@/lib/pinecone';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    const documentId = params.documentId;
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Connect to MongoDB
    await connectDB();

    // Find the document
    const document = await Document.findOne({ _id: documentId, userId });
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Delete from S3
    const key = document.fileUrl.split('/').pop();
    if (key) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        })
      );
    }

    // Delete from Pinecone
    const index = pinecone.Index(INDEX_NAME);
    await index.deleteMany({
      filter: {
        documentId: document.pineconeId,
      },
    });

    // Delete from MongoDB
    await Document.deleteOne({ _id: documentId, userId });

    return NextResponse.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
} 