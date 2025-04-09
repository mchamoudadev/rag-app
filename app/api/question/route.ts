import { NextRequest, NextResponse } from "next/server";
import { PineconeStore } from "@langchain/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { INDEX_NAME } from "@/lib/pinecone";
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Function to check if index exists
async function checkIndexExists() {
  try {
    const indexList = await pinecone.listIndexes();
    return indexList.indexes?.some(index => index.name === INDEX_NAME) || false;
  } catch (error) {
    console.error('Error checking index:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, documentId } = await req.json();
    const userId = req.headers.get('x-user-id');

    if (!prompt) {
      return NextResponse.json(
        { message: "No prompt provided" },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { message: "No user ID found in request" },
        { status: 401 }
      );
    }

    // First get the document from MongoDB to get its pineconeId
    await connectDB();
    const document = documentId ? await Document.findById(documentId) : null;
    const pineconeId = document?.pineconeId;

    // Check if index exists before proceeding
    const indexExists = await checkIndexExists();
    
    if (!indexExists) {
      return NextResponse.json({
        text: "No documents have been uploaded yet. Please upload a document first."
      });
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Get relevant documents from Pinecone
    const index = pinecone.Index(INDEX_NAME);
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });

    // Create vector store with document filter using the actual pineconeId value
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: userId,
      filter: documentId ? {documentId: document.pineconeId } : undefined
    });

    // Search for similar documents
    const similarDocs = await vectorStore.similaritySearch(prompt, 8);
    console.log("With documentId filter:", documentId ? { pineconeId } : "no filter");
    console.log("similarDocs", similarDocs);

    if (similarDocs.length === 0) {
      return NextResponse.json({
        text: "I couldn't find any relevant information to answer your question. Please try asking something related to the documents you've uploaded."
      });
    }

    // Extract potential metadata from first few pages
    const firstFewPages = similarDocs.filter(doc => 
      doc.metadata.page && parseInt(doc.metadata.page) <= 3
    );

    // Try to extract book metadata from early pages
    let bookMetadata = {
      title: document?.fileName || "Unknown",
      authors: [],
      summary: "",
      publicationInfo: ""
    };

    // Build enhanced context with document structure
    let context = "";
    
    // First add any metadata found in early pages
    if (firstFewPages.length > 0) {
      context += "Document Metadata:\n";
      firstFewPages.forEach(doc => {
        context += doc.pageContent + "\n";
      });
      context += "\n---\n\n";
    }

    // Then add the specific content relevant to the query
    context += similarDocs.map((doc, i) => {
      const pageInfo = doc.metadata.page ? `Page ${doc.metadata.page}` : 'Unknown page';
      const fileName = doc.metadata.fileName || 'Unknown document';
      return `[Document ${i+1}: ${fileName}, ${pageInfo}]\n${doc.pageContent}\n\n`;
    }).join('');

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful AI research assistant. Answer questions based on the provided document excerpts below.

When analyzing the document content:
1. Pay special attention to the first few pages which often contain important metadata
2. Look for author names, publication information, and book summaries typically found in:
   - Title pages
   - Copyright pages
   - Preface or Introduction
   - About the Author sections
3. When asked about document metadata (authors, publication, etc):
   - First check the Document Metadata section
   - If not found there, look for this information throughout the provided excerpts
   - Clearly state if you can't find specific metadata
4. For general content questions:
   - Use the page-specific excerpts provided
   - Cite specific pages when providing information

The documents contain page numbers and filenames in brackets - use this information for citations.

If you absolutely cannot find the requested information in the provided context, say "I don't have enough information to answer that question. This information might be in parts of the document I don't have access to."

Context:
${context}`
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return NextResponse.json({
      text: response.choices[0].message.content,
      sourceDocuments: similarDocs.map(doc => ({
        content: doc.pageContent.substring(0, 150) + "...",
        metadata: doc.metadata,
      })),
      document: document ? {
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        uploadDate: document.uploadDate,
      } : null,
    });
  } catch (error: any) {
    console.error("Error querying documents:", error);
    return NextResponse.json(
      { error: error.message || "An error occurred while processing your question" },
      { status: 500 }
    );
  }
} 