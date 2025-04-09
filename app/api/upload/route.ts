import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { INDEX_NAME } from '@/lib/pinecone';
import { OpenAI } from 'openai';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { uploadToS3 } from '@/lib/s3';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Function to ensure index exists
async function ensureIndexExists() {
  try {
    // Try to get the index - if it fails with 404, we'll create it
    const indexList = await pinecone.listIndexes();
    const indexExists = indexList.indexes?.some(index => index.name === INDEX_NAME);
    
    if (!indexExists) {
      console.log(`Creating index ${INDEX_NAME}...`);
      
      // Create the index with appropriate dimensions for the embeddings
      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: 1536, // OpenAI embedding dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      // Wait for index to initialize - this can take 1-2 minutes
      console.log('Waiting for index to initialize (this can take 1-2 minutes)...');
      
      // Try to check index status for up to 2 minutes
      const maxRetries = 12; // 12 retries × 10 seconds = 2 minutes
      for (let i = 0; i < maxRetries; i++) {
        try {
          console.log(`Checking index status (attempt ${i+1}/${maxRetries})...`);
          const indexInfo = await pinecone.describeIndex(INDEX_NAME);
          if (indexInfo.status?.ready) {
            console.log('Index is now ready!');
            return;
          }
        } catch (error) {
          console.log('Index not ready yet, waiting...');
        }
        
        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      console.log('Index creation may still be in progress. Proceeding with upload...');
    }
  } catch (error) {
    console.error('Error checking/creating index:', error);
    throw new Error('Failed to create Pinecone index. Please try again later.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'No user ID provided' },
        { status: 400 }
      );
    }

    // Ensure Pinecone index exists before proceeding
    await ensureIndexExists();

    // Generate a document id
    const documentId = crypto.randomUUID();

    // Convert file to buffer for S3 upload
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Upload to S3
    const fileUrl = await uploadToS3(fileBuffer, file.name);

    // Load and parse PDF
    const blob = new Blob([fileBuffer], { type: file.type });
    const loader = new PDFLoader(blob);
    const docs = await loader.load();

    // Split text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await textSplitter.splitDocuments(docs);

    // Add metadata to each chunk
    const docsWithMetadata = splitDocs.map((doc) => ({
      pageContent: doc.pageContent,
      metadata: {
        documentId: documentId,
        fileName: file.name,
        userId: userId,
        page: doc.metadata.loc?.pageNumber || 'unknown',
      },
    }));

    // Generate summary
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    const summary = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes documents."
        },
        {
          role: "user",
          content: `Summarize the following document: ${splitDocs[0].pageContent}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    // Store in Pinecone with metadata
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });

    const index = pinecone.Index(INDEX_NAME);

    await PineconeStore.fromDocuments(docsWithMetadata, embeddings, {
      pineconeIndex: index,
      namespace: userId, // Optional: use userId as namespace for better organization
    });

    // Connect to MongoDB and save document metadata
    await connectDB();
    await Document.create({
      fileName: file.name,
      fileUrl,
      pineconeId: documentId,
      userId,
    });

    return NextResponse.json({
      success: true,
      summary: summary.choices[0].message.content,
      documentId,
      pageCount: docs.length,
      fileName: file.name
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload document' },
      { status: 500 }
    );
  }
} 