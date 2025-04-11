import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, S3_BUCKET } from '@/lib/aws';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { Pinecone } from '@pinecone-database/pinecone';
import { INDEX_NAME } from '@/lib/pinecone';
import { verifyToken } from '@/lib/auth';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function GET(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    // Get token from Authorization header
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify token and get user ID
    const userData = await verifyToken(token);
    if (!userData || !userData.userId) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const documentId = params.documentId;
    console.log(`Fetching document: ${documentId} for user: ${userData.userId}`);

    // Connect to MongoDB
    await connectDB();

    // Find the document
    const document = await Document.findOne({
      _id: documentId,
      userId: userData.userId
    });

    console.log(`Document found: ${document ? 'yes' : 'no'}`);

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(document);
  } catch (error: any) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { documentId: string } }
) {
  try {
    // Get token from Authorization header
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify token and get user ID
    const userData = await verifyToken(token);
    if (!userData || !userData.userId) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const documentId = params.documentId;
    console.log(`Deleting document: ${documentId} for user: ${userData.userId}`);

    // Connect to MongoDB
    await connectDB();

    // Find the document
    const document = await Document.findOne({
      _id: documentId,
      userId: userData.userId
    });

    console.log(`Document found for deletion: ${document ? 'yes' : 'no'}`);

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
    try {
      const index = pinecone.Index(INDEX_NAME);
      await index.deleteMany({
        filter: {
          documentId: document.pineconeId,
        },
        namespace: userData.userId
      });
    } catch (error) {
      console.error('Error deleting from Pinecone:', error);
      // Continue with MongoDB deletion even if Pinecone deletion fails
    }

    // Delete from MongoDB
    await Document.findByIdAndDelete(documentId);

    return NextResponse.json({ 
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete document' },
      { status: 500 }
    );
  }
} 