import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { INDEX_NAME } from '@/lib/pinecone';
import { OpenAI } from 'openai';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { getSubtitles } from 'youtube-captions-scraper';

interface TranscriptEntry {
  text: string;
  start: number;
  duration: number;
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

// Function to ensure index exists
async function ensureIndexExists() {
  try {
    const indexList = await pinecone.listIndexes();
    const indexExists = indexList.indexes?.some(index => index.name === INDEX_NAME);
    
    if (!indexExists) {
      console.log(`Creating index ${INDEX_NAME}...`);
      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: 1536,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      console.log('Waiting for index to initialize...');
      const maxRetries = 12;
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
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  } catch (error) {
    console.error('Error checking/creating index:', error);
    throw new Error('Failed to create Pinecone index');
  }
}

// Function to extract video ID from URL
function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

async function getVideoInfo(videoId: string) {
  try {
    console.log('Fetching video info for videoId:', videoId);
    console.log('Using YouTube API key:', process.env.YOUTUBE_API_KEY ? 'Present' : 'Missing');
    
    // Fetch video details including statistics
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
    );
    
    console.log('YouTube API Response Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('YouTube API Error Response:', errorText);
      throw new Error(`Failed to fetch video info: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('YouTube API Response Data:', JSON.stringify(data, null, 2));
    
    if (!data.items || data.items.length === 0) {
      console.error('No video items found in response');
      throw new Error('Video not found');
    }

    return data.items[0];
  } catch (error) {
    console.error('Error in getVideoInfo:', error);
    throw error;
  }
}

async function getVideoTranscript(videoId: string) {
  try {
    console.log('Fetching transcript for videoId:', videoId);
    const subtitles = await getSubtitles({
      videoID: videoId,
      lang: 'en'
    });
    console.log('Transcript fetched successfully, number of segments:', subtitles.length);
    
    // Combine all transcript segments into a single text
    const fullTranscript = subtitles.map((segment: { text: string }) => segment.text).join(' ');
    console.log('Combined transcript length:', fullTranscript.length);
    
    return fullTranscript;
  } catch (error) {
    console.error('Error fetching transcript:', error);
    // If transcript is not available, return null
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('Starting YouTube video processing...');
    const { videoUrl, userId } = await req.json();
    console.log('Received request with videoUrl:', videoUrl, 'userId:', userId);

    if (!videoUrl) {
      console.error('No video URL provided');
      return NextResponse.json(
        { error: 'No video URL provided' },
        { status: 400 }
      );
    }

    if (!userId) {
      console.error('No user ID provided');
      return NextResponse.json(
        { error: 'No user ID provided' },
        { status: 400 }
      );
    }

    // Extract video ID from URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      console.error('Invalid YouTube URL:', videoUrl);
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400 }
      );
    }

    console.log('Getting video info from YouTube API...');
    const videoData = await getVideoInfo(videoId);
    console.log('YouTube API data received:', {
      title: videoData.snippet.title,
      descriptionLength: videoData.snippet.description?.length || 0,
      channelTitle: videoData.snippet.channelTitle,
      viewCount: videoData.statistics?.viewCount || 0
    });

    const title = videoData.snippet.title;
    const description = videoData.snippet.description || 'No description available';
    const duration = videoData.contentDetails.duration;
    
    // Convert ISO 8601 duration to seconds
    const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const hours = (durationMatch[1] || 0) * 3600;
    const minutes = (durationMatch[2] || 0) * 60;
    const seconds = (durationMatch[3] || 0);
    const durationInSeconds = hours + minutes + seconds;

    // Extract thumbnails
    const thumbnails = {
      default: videoData.snippet.thumbnails.default?.url || '',
      medium: videoData.snippet.thumbnails.medium?.url || '',
      high: videoData.snippet.thumbnails.high?.url || '',
      standard: videoData.snippet.thumbnails.standard?.url || '',
      maxres: videoData.snippet.thumbnails.maxres?.url || ''
    };

    // Get video transcript
    console.log('Attempting to fetch video transcript...');
    const transcript = await getVideoTranscript(videoId);
    
    // Use transcript if available, otherwise fall back to description
    const content = transcript || description;
    console.log('Using content type:', transcript ? 'transcript' : 'description');
    console.log('Content length:', content.length);
    console.log('Video duration:', durationInSeconds, 'seconds');

    // Ensure Pinecone index exists
    console.log('Checking Pinecone index...');
    await ensureIndexExists();

    // Generate a document id
    const documentId = crypto.randomUUID();
    console.log('Generated documentId:', documentId);

    // Split content into chunks
    console.log('Splitting content into chunks...');
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.createDocuments(
      [content],
      [{ 
        documentId, 
        fileName: title, 
        userId, 
        type: 'youtube', 
        videoId, 
        duration: durationInSeconds,
        channelTitle: videoData.snippet.channelTitle,
        publishedAt: new Date(videoData.snippet.publishedAt),
        tags: videoData.snippet.tags || [],
        categoryId: videoData.snippet.categoryId,
        viewCount: parseInt(videoData.statistics?.viewCount || '0'),
        likeCount: parseInt(videoData.statistics?.likeCount || '0'),
        commentCount: parseInt(videoData.statistics?.commentCount || '0'),
        hasTranscript: !!transcript
      }]
    );
    console.log('Created', docs.length, 'document chunks');

    // Generate summary
    console.log('Generating summary with OpenAI...');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    const summary = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes video content."
        },
        {
          role: "user",
          content: `Summarize the following ${transcript ? 'video transcript' : 'video description'}: ${content}`
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    console.log('Summary generated successfully');

    // Store in Pinecone
    console.log('Storing in Pinecone...');
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY!,
    });

    const index = pinecone.Index(INDEX_NAME);
    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace: userId,
    });
    console.log('Successfully stored in Pinecone');

    // Save to MongoDB
    console.log('Saving to MongoDB...');
    await connectDB();
    await Document.create({
      fileName: title,
      fileUrl: videoUrl,
      pineconeId: documentId,
      userId,
      type: 'youtube',
      videoId,
      duration: durationInSeconds,
      channelTitle: videoData.snippet.channelTitle,
      publishedAt: new Date(videoData.snippet.publishedAt),
      thumbnail: thumbnails,
      tags: videoData.snippet.tags || [],
      categoryId: videoData.snippet.categoryId,
      viewCount: parseInt(videoData.statistics?.viewCount || '0'),
      likeCount: parseInt(videoData.statistics?.likeCount || '0'),
      commentCount: parseInt(videoData.statistics?.commentCount || '0')
    });
    console.log('Successfully saved to MongoDB');

    return NextResponse.json({
      success: true,
      summary: summary.choices[0].message.content,
      documentId,
      fileName: title,
      duration: durationInSeconds,
      thumbnail: thumbnails.medium || thumbnails.default,
      channelTitle: videoData.snippet.channelTitle,
      viewCount: parseInt(videoData.statistics?.viewCount || '0'),
      hasTranscript: !!transcript
    });
  } catch (error: any) {
    console.error('Error processing YouTube video:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to process YouTube video' },
      { status: 500 }
    );
  }
} 