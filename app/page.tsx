'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DocumentList from '@/components/DocumentList';
import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  const router = useRouter();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = localStorage.getItem('user');
        const token = localStorage.getItem('token');

        if (!userData || !token) {
          router.push('/login');
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error('Error checking authentication:', err);
        setError('Failed to check authentication status');
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleDocumentSelect = (documentId: string) => {
    setSelectedDocumentId(documentId);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 min-w-[320px] flex-shrink-0 bg-white border-r overflow-hidden flex flex-col">
        <div className="p-4 border-b">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">UniRAG</h1>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <DocumentList
            onDocumentSelect={handleDocumentSelect}
            selectedDocumentId={selectedDocumentId}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          selectedDocumentId={selectedDocumentId}
          onDocumentUpload={() => {
            // Force a refresh of the document list
            setSelectedDocumentId('');
          }}
        />
      </div>
    </div>
  );
}
