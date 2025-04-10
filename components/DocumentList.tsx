import { useState, useEffect } from 'react';
import { Document } from '@/types/document';
import { FaYoutube, FaFilePdf } from 'react-icons/fa';

interface DocumentListProps {
  onDocumentSelect: (documentId: string) => void;
  selectedDocumentId?: string;
  onDocumentUpload?: () => void;
}

export default function DocumentList({ onDocumentSelect, selectedDocumentId, onDocumentUpload }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch('/api/documents', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please login again.');
        }
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDelete = async (documentId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      // Remove the document from the local state
      setDocuments(documents.filter(doc => doc._id !== documentId));
      
      // If the deleted document was selected, clear the selection
      if (selectedDocumentId === documentId) {
        onDocumentSelect('');
      }
    } catch (err) {
      console.error('Error deleting document:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Your Documents</h2>
      {documents.length === 0 ? (
        <p className="text-gray-500">No documents uploaded yet</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc._id}
              className={`relative group rounded-lg transition-colors ${
                selectedDocumentId === doc._id
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <div 
                className="p-3 cursor-pointer"
                onClick={() => onDocumentSelect(doc._id)}
              >
                <div className="flex items-center space-x-3">
                  {doc.type === 'youtube' ? (
                    <FaYoutube className="text-red-500 text-xl flex-shrink-0" />
                  ) : (
                    <FaFilePdf className="text-red-500 text-xl flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate pr-8">{doc.fileName}</h3>
                    <p className="text-sm text-gray-500 flex items-center space-x-1">
                      <span>{doc.type === 'youtube' ? 'YouTube Video' : 'PDF Document'}</span>
                      <span>•</span>
                      <span>{new Date(doc.uploadDate).toLocaleDateString()}</span>
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(doc._id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-500 hover:text-red-700 rounded-full hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete document"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
} 