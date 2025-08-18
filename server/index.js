import express from 'express';
import cors from 'cors';
import { agent } from './agent.js';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import { addPDFToVectorStore } from "./embeddings.js";
import { pool, testConnection } from './database.js';
import path from 'node:path';
import fs from 'node:fs';
// const path = require('path');
// const fs = require('fs');

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '200mb' }));
app.use(cors());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Configure multer for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB

});
// const upload = multer({
//   storage: multer.diskStorage({
//     destination: (req, file, cb) => cb(null, './uploads'),
//     filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
//   }),
//   limits: { fileSize: 10 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype === 'application/pdf') cb(null, true);
//     else cb(new Error('Only PDF files allowed'), false);
//   }
// });

testConnection().catch(err => {
  console.error('Failed to connect to Neon database on startup:', err);
  process.exit(1);
});

// Enhanced PDF upload with retry logic
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
      }

      console.log(`📄 Processing PDF: ${req.file.originalname} (${req.file.size} bytes)`);

      console.log(req.file);

      // const filePath = path.join(__dirname, 'uploads', Date.now() + '-' + req.file.originalname);
      // fs.writeFileSync(filePath, req.file.buffer);

      const pdfBuffer = req.file.buffer;
      const pdfData = await pdfParse(pdfBuffer);

      if (!pdfData.text || pdfData.text.trim().length === 0) {
        return res.status(400).json({ error: 'PDF contains no readable text' });
      }

      const document_id = uuidv4();
      const filename = req.file.originalname;
      const file_size = req.file.size;

      const uploadsDir = './uploads';
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const savedFilename = `${Date.now()}-${filename}`;
      const filePath = path.join(uploadsDir, savedFilename);
      fs.writeFileSync(filePath, pdfBuffer);


      console.log(`🔄 Adding PDF to vector store...`);
      // console.log(typeof document_id);
      const result = await addPDFToVectorStore({
        text: pdfData.text,
        document_id,
        filename,
        file_size
      });

      console.log(`✅ PDF processed successfully: ${result.chunks_created} chunks created`);

      res.json({
        message: 'PDF processed successfully',
        ...result
      });
      return; // Success, exit retry loop

    } catch (error) {
      console.error(`PDF upload error (attempt ${retryCount + 1}):`, error);

      // Check if it's a connection error that might be retryable
      if (error.message.includes('Connection terminated') && retryCount < maxRetries - 1) {
        retryCount++;
        console.log(`🔄 Retrying PDF upload (attempt ${retryCount + 1})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        continue;
      }

      return res.status(500).json({
        error: 'Failed to process PDF',
        details: error.message
      });
    }
  }
});

// Enhanced generate endpoint
app.post('/generate', async (req, res) => {
  try {
    const { query, document_id, thread_id } = req.body;

    if (!query || !document_id) {
      return res.status(400).json({
        error: 'Query and document_id are required'
      });
    }
// console.log(document_id );
    // Include document_id in the message content itself
    const enhancedQuery = `Document ID: ${document_id}\nUser Query: ${query}`;

    const results = await agent.invoke({
      messages: [{
        role: 'user',
        content: enhancedQuery,
      }],
    }, {
      configurable: {
        thread_id: thread_id || 'default',
        document_id: document_id
      }
    });

    res.json({
      response: results.messages[results.messages.length - 1]?.content,
      document_id: document_id
    });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      details: error.message
    });
  }
});

// List uploaded documents
// Enhanced documents endpoint with error handling
app.get('/documents', async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    const query = `
      SELECT DISTINCT
        metadata->>'document_id' as document_id,
        metadata->>'filename' as filename,
        metadata->>'file_size' as file_size,
        metadata->>'upload_date' as upload_date
      FROM documents
      WHERE metadata->>'document_id' IS NOT NULL
      ORDER BY metadata->>'upload_date' DESC
    `;

    const result = await client.query(query);

    res.json({
      documents: result.rows.map(row => ({
        document_id: row.document_id,
        filename: row.filename,
        file_size: parseInt(row.file_size) || 0,
        upload_date: row.upload_date
      }))
    });
  } catch (error) {
    console.error('Documents list error:', error);
    res.status(500).json({
      error: 'Failed to fetch documents',
      details: error.message
    });
  } finally {
    if (client) client.release();
  }
});

// Example: Express route for fetching a document by ID
app.get('/document/:document_id', async (req, res) => {
  const { document_id } = req.params;
  try {
    const client = await pool.connect();
    const query = `
      SELECT content, metadata
      FROM documents
      WHERE metadata->>'document_id' = $1
      LIMIT 1
    `;
    const result = await client.query(query, [document_id]);
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.log(`error while fetching document->${document_id}`, error);
    res.status(500).json({ error: error.message });
  }
});


// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'connected',
      db_time: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  pool.end(() => {
    console.log('Neon database pool closed');
    process.exit(0);
  });
});

app.listen(port, () => {
  console.log(`✅ PDF RAG server running on port ${port}`);
  console.log(`🌐 Server URL: http://localhost:${port}`);
  console.log(`🗄️  Database: Neon PostgreSQL with pgvector`);
});
