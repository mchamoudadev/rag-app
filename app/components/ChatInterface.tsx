import { useState, FC, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Document } from '@/types/document';
import { chatStorage } from '@/app/lib/chatStorage';
import { FaYoutube, FaFilePdf } from 'react-icons/fa';

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  documentId: string;
}

interface ChatInterfaceProps {
  userId: string;
  documents: Document[];
  setDocuments: (documents: Document[]) => void;
  currentDocument: Document | null;
  setCurrentDocument: (document: Document | null) => void;
}

const ChatInterface: FC<ChatInterfaceProps> = ({
  userId,
  documents,
  setDocuments,
  currentDocument,
  setCurrentDocument
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);

  // Load messages when document changes
  useEffect(() => {
    const loadMessages = async () => {
      if (currentDocument) {
        try {
          // Try to load from IndexedDB first
          const localMessages = await chatStorage.getMessages(currentDocument._id);
          if (localMessages.length > 0) {
            setMessages(localMessages);
          } else {
            // If no local messages, try to load from server
            const response = await fetch(`/api/chat?documentId=${currentDocument._id}`, {
              headers: {
                'x-user-id': userId
              }
            });
            if (response.ok) {
              const { messages: serverMessages } = await response.json();
              setMessages(serverMessages);
              // Save to IndexedDB for offline access
              await Promise.all(serverMessages.map(msg => chatStorage.saveMessage(msg)));
            }
          }
        } catch (error) {
          console.error('Error loading messages:', error);
        }
      } else {
        setMessages([]);
      }
    };

    loadMessages();
  }, [currentDocument, userId]);

  const saveMessages = async (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    if (currentDocument) {
      try {
        // Save to IndexedDB
        await Promise.all(newMessages.map(msg => chatStorage.saveMessage(msg)));
        
        // Save to server
        await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId
          },
          body: JSON.stringify({
            messages: newMessages,
            documentId: currentDocument._id,
            userId
          })
        });
      } catch (error) {
        console.error('Error saving messages:', error);
        toast.error('Failed to save chat history');
      }
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentDocument) return;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content: input,
      role: 'user',
      timestamp: Date.now(),
      documentId: currentDocument._id
    };

    const updatedMessages = [...messages, newMessage];
    await saveMessages(updatedMessages);
    setInput('');

    // Handle AI response here...
  };

  const deleteDocument = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete document');
      }

      // Remove the document from the local state
      setDocuments(documents.filter(doc => doc._id !== documentId));
      
      // If the deleted document was the current one, clear the current document
      if (currentDocument?._id === documentId) {
        setCurrentDocument(null);
      }

      // Show success message
      toast.success('Document deleted successfully');
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error(error.message || 'Failed to delete document');
    } finally {
      setDocumentToDelete(null);
    }
  };

  const handleDeleteClick = (documentId: string) => {
    setDocumentToDelete(documentId);
  };

  const confirmDelete = () => {
    if (documentToDelete) {
      deleteDocument(documentToDelete);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Document List */}
      <div className="flex-1 overflow-y-auto p-4">
        {documents.map((doc) => (
          <div 
            key={doc._id} 
            className={`flex items-center justify-between p-4 mb-2 rounded-lg shadow cursor-pointer transition-all ${
              currentDocument?._id === doc._id 
                ? 'bg-blue-50 border-2 border-blue-500' 
                : 'bg-white hover:bg-gray-50'
            }`}
            onClick={() => setCurrentDocument(doc)}
          >
            <div className="flex items-center space-x-3 flex-1">
              {doc.type === 'youtube' ? (
                <FaYoutube className="text-red-500 text-xl" />
              ) : (
                <FaFilePdf className="text-red-500 text-xl" />
              )}
              <div>
                <h3 className="font-medium">{doc.fileName}</h3>
                <p className="text-sm text-gray-500">
                  {doc.type === 'youtube' ? 'YouTube Video' : 'PDF Document'}
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(doc._id);
              }}
              className="p-2 text-red-500 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {/* Document Preview */}
      {currentDocument && (
        <div className="p-4 border-t">
          {currentDocument.type === 'youtube' && currentDocument.fileUrl && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Video Preview</h3>
              <div className="relative pb-[56.25%] h-0">
                <iframe
                  src={`https://www.youtube.com/embed/${new URL(currentDocument.fileUrl).searchParams.get('v')}`}
                  className="absolute top-0 left-0 w-full h-full rounded-lg"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 p-4 rounded-lg max-w-[80%] ${
              message.role === 'user' 
                ? 'bg-blue-100 ml-auto' 
                : 'bg-gray-100'
            }`}
          >
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t">
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border rounded"
            disabled={!currentDocument}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
            disabled={!currentDocument}
          >
            Send
          </button>
        </form>
      </div>

      {/* Confirmation Dialog */}
      {documentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Confirm Deletion</h2>
            <p className="mb-4">Are you sure you want to delete this document? This action cannot be undone.</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setDocumentToDelete(null)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 