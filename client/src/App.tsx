import { useState, useRef, useEffect } from 'react';
import './index.css';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
}

interface DocumentMeta {
  document_id: string;
  filename: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(Date.now());
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const fetchDocuments = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/documents`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      setDocuments([]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }
    setUploading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const formData = new FormData();
      formData.append('pdf', file);
      const response = await fetch(`${apiUrl}/upload-pdf`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to upload PDF');

      const data = await response.json();
      console.log(data);
      setSelectedDocument(data.document_id);
      await fetchDocuments();
      alert('PDF uploaded and processed!');
    } catch (error) {
      alert('Error uploading PDF.');
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    if (inputText.trim() === '' || isLoading || !selectedDocument) return;
    const userMessage: Message = {
      id: Date.now(),
      text: inputText.trim(),
      isUser: true,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      console.log(selectedDocument, threadId);
      const response = await fetch(`${apiUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMessage.text,
          document_id: selectedDocument,
          thread_id: threadId,
        }),
      });
      if (!response.ok) throw new Error('Failed to get response');
      const data = await response.json();
      const aiMessage: Message = {
        id: Date.now() + 1,
        text: data.response || data,
        isUser: false,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now() + 2,
        text: 'Sorry, there was an error processing your request.',
        isUser: false,
      };
      console.error(error);
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setThreadId(Date.now());
  };

  const handleDocumentSelect = async (docId: string) => {
    setSelectedDocument(docId);
    resetChat();

    // // Fetch document content from backend
    // try {
    //   const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    //   const response = await fetch(`${apiUrl}/document/${docId}`);
    //   if (!response.ok) throw new Error('Failed to fetch document');
    //
    // } catch (error) {
    //   console.error(error);
    //   alert('Could not load document. Please try again.');
    //   // setCurrentDocument(null);
    // }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>PDF Chatbot</h1>
        <button className="reset-button" onClick={resetChat}>
          Reset Chat
        </button>
      </div>

      <div style={{ margin: '16px 0' }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading && <span style={{ marginLeft: 8 }}>Uploading...</span>}
      </div>

      <div style={{ margin: '12px 0' }}>
        <label htmlFor="pdf-select">Select PDF:</label>
        <select
          id="pdf-select"
          value={selectedDocument || ''}
          onChange={(e) => handleDocumentSelect(e.target.value)}
          style={{ marginLeft: 8 }}
        >
          <option value="" disabled>
            -- Choose a document --
          </option>
          {documents.map((doc) => (
            <option key={doc.document_id} value={doc.document_id}>
              {doc.filename}
            </option>
          ))}
        </select>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            Start your conversation with the AI about your uploaded PDF.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.isUser ? 'user-message' : 'ai-message'}`}
            >
              <div className="message-avatar">
                {message.isUser ? 'You' : 'AI'}
              </div>
              <div className="message-content">{message.text}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
        {isLoading && (
          <div className="message ai-message loading">
            <div className="message-avatar">AI</div>
            <div className="message-content">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
      </div>

      <div className="input-container">
        <textarea
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedDocument
              ? 'Type your question about the PDF...'
              : 'Upload and select a PDF to start chatting'
          }
          disabled={!selectedDocument || isLoading}
        />
        <button
          className="send-button"
          onClick={sendMessage}
          disabled={!inputText.trim() || isLoading || !selectedDocument}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
