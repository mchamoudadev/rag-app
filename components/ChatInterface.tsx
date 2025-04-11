import { useState, useRef, useEffect } from 'react';
import { Message } from '@/types/message';
import ReactMarkdown from 'react-markdown';
import { Document } from '@/types/document';
import { FaYoutube, FaFilePdf, FaExpand, FaCompress, FaTimes } from 'react-icons/fa';

interface ChatInterfaceProps {
  selectedDocumentId?: string;
  onDocumentUpload?: () => void;
}

export default function ChatInterface({ selectedDocumentId, onDocumentUpload }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch current document when selectedDocumentId changes
  useEffect(() => {
    const fetchDocument = async () => {
      if (!selectedDocumentId) {
        setCurrentDocument(null);
        setMessages([]);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await fetch(`/api/documents/${selectedDocumentId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch document details');
        }

        const document = await response.json();
        setCurrentDocument(document);
        
        // Fetch chat history for this document
        await fetchChatHistory(selectedDocumentId);
      } catch (err) {
        console.error('Error fetching document:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch document');
      }
    };

    fetchDocument();
  }, [selectedDocumentId]);

  // Fetch chat history for a document
  const fetchChatHistory = async (documentId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`/api/chat?documentId=${documentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status !== 404) { // 404 just means no history yet
          throw new Error('Failed to fetch chat history');
        }
        setMessages([]);
        return;
      }

      const { messages: chatHistory } = await response.json();
      setMessages(chatHistory || []);
    } catch (err) {
      console.error('Error fetching chat history:', err);
      // Don't show error to user, just start with empty chat
      setMessages([]);
    }
  };

  // Save chat history
  const saveChatHistory = async (updatedMessages: Message[]) => {
    if (!selectedDocumentId) return;
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: updatedMessages,
          documentId: selectedDocumentId
        }),
      });
    } catch (err) {
      console.error('Error saving chat history:', err);
      // Continue without showing error to user
    }
  };

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      
      if (!token || !userData) {
        throw new Error('No authentication token or user data found');
      }

      const user = JSON.parse(userData);
      if (!user._id) {
        throw new Error('Invalid user data');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user._id);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: `Document "${data.fileName}" uploaded successfully!` }]);
      
      // Refresh the document list
      if (onDocumentUpload) {
        onDocumentUpload();
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleYoutubeUpload = async () => {
    if (!youtubeUrl) return;

    setUploading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      
      if (!token || !userData) {
        throw new Error('No authentication token or user data found');
      }

      const user = JSON.parse(userData);
      if (!user._id) {
        throw new Error('Invalid user data');
      }

      const response = await fetch('/api/upload-youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoUrl: youtubeUrl,
          userId: user._id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: `YouTube video "${data.fileName}" uploaded successfully!` }]);
      setYoutubeUrl('');
      
      // Refresh the document list
      if (onDocumentUpload) {
        onDocumentUpload();
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedDocumentId) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);
    
    // Save chat history with user message
    await saveChatHistory(updatedMessages);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/question', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: userMessage.content,
          documentId: selectedDocumentId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to get response');
      }

      // Add an empty assistant message that we'll update with the stream
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      };
      
      const messagesWithAssistant = [...updatedMessages, assistantMessage];
      setMessages(messagesWithAssistant);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let fullContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullContent += chunk;
        
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant') {
            lastMessage.content = fullContent;
          }
          return newMessages;
        });
      }
      
      // Save final chat history with response
      setMessages(prev => {
        saveChatHistory(prev);
        return prev;
      });
      
    } catch (err) {
      console.error('Query error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process query');
      
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        timestamp: Date.now()
      };
      
      const messagesWithError = [...updatedMessages, errorMessage];
      setMessages(messagesWithError);
      await saveChatHistory(messagesWithError);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Document Preview Section - Show for selected document */}
      {currentDocument && (
        <div className="border-b bg-gray-50">
          <div className="flex items-center justify-between p-4 mb-2">
            <div className="flex items-center space-x-2">
              {currentDocument.type === 'youtube' ? (
                <FaYoutube className="text-red-500 text-xl" />
              ) : (
                <FaFilePdf className="text-red-500 text-xl" />
              )}
              <h2 className="text-lg font-semibold">{currentDocument.fileName}</h2>
            </div>
            
            {currentDocument.type === 'youtube' && (
              <button
                onClick={() => setVideoExpanded(!videoExpanded)}
                className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                aria-label={videoExpanded ? "Minimize video" : "Expand video"}
              >
                <FaExpand className="text-gray-600" />
              </button>
            )}
          </div>
          
          {currentDocument.type === 'youtube' && (
            <div className="p-4 pt-0">
              <div className="h-48 sm:h-64 md:h-72 rounded-lg overflow-hidden shadow-md">
                <iframe
                  src={`https://www.youtube.com/embed/${new URL(currentDocument.fileUrl).searchParams.get('v')}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen Video Modal */}
      {videoExpanded && currentDocument?.type === 'youtube' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 transition-opacity duration-300">
          <div className="relative w-full max-w-5xl mx-auto p-4 animate-fadeIn">
            <button
              onClick={() => setVideoExpanded(false)}
              className="absolute -top-12 right-4 p-2 text-white hover:text-gray-300 transition-colors"
              aria-label="Close video"
            >
              <FaTimes className="text-2xl" />
            </button>
            
            <div className="relative pb-[56.25%] h-0 rounded-lg overflow-hidden shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${new URL(currentDocument.fileUrl).searchParams.get('v')}?autoplay=1`}
                className="absolute top-0 left-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            
            <div className="mt-4 text-center">
              <h2 className="text-xl font-semibold text-white mb-2">{currentDocument.fileName}</h2>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${videoExpanded ? 'hidden' : ''}`}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg ${
              message.role === 'user' ? 'bg-blue-50 ml-auto max-w-[80%]' : 'bg-gray-50 max-w-[80%]'
            }`}
          >
            {message.role === 'assistant' ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              message.content
            )}
          </div>
        ))}
        {isStreaming && (
          <div className="p-3 rounded-lg bg-gray-50">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`border-t p-4 ${videoExpanded ? 'hidden' : ''}`}>
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        
        <form onSubmit={handleQuery} className="space-y-4">
          <div className="flex space-x-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              className="hidden"
              accept=".pdf"
            />
            <button
              type="button"
              onClick={handleFileSelect}
              disabled={uploading || isStreaming}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload PDF'}
            </button>
            <div className="flex-1 flex space-x-2">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="Enter YouTube URL..."
                className="flex-1 p-2 border rounded-lg"
                disabled={uploading || isStreaming}
              />
              <button
                type="button"
                onClick={handleYoutubeUpload}
                disabled={!youtubeUrl || uploading || isStreaming}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                Add YouTube Video
              </button>
            </div>
          </div>

          <div className="flex space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedDocumentId ? "Ask a question about your document..." : "Select a document to start chatting..."}
              className="flex-1 p-3 border rounded-lg"
              disabled={!selectedDocumentId || isStreaming}
            />
            <button
              type="submit"
              disabled={!selectedDocumentId || !input.trim() || isStreaming}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 