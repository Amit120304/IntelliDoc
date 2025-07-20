import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import {MistralAIEmbeddings} from "@langchain/mistralai";
import dotenv from 'dotenv';
dotenv.config();
const embeddings = new MistralAIEmbeddings({
  model: "mistral-embed",
});

export const vectorStore = await PGVectorStore.initialize(embeddings, {
  postgresConnectionOptions: {
    connectionString: process.env.DB_URL,
  },
  tableName: 'documents',
  columns: {
    idColumnName: 'id',
    vectorColumnName: 'vector',
    contentColumnName: 'content',
    metadataColumnName: 'metadata',
  },
  distanceStrategy: 'cosine',
});


// Updated function for PDF processing
export const addPDFToVectorStore = async (pdfData) => {
  const { text, document_id, filename, file_size } = pdfData;

  const docs = [
    new Document({
      pageContent: text,
      metadata: {
        document_id,
        filename,
        file_size,
        upload_date: new Date().toISOString(),
        file_type: 'pdf'
      },
    }),
  ];

  // Split the video into chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const chunks = await splitter.splitDocuments(docs);

  // Use try-catch for vector operations
  try {
    await vectorStore.addDocuments(chunks);
    console.log(`✅ Added ${chunks.length} chunks to vector store`);
  } catch (error) {
    console.error('❌ Error adding documents to vector store:', error);
    throw error;
  }
  return {
    document_id,
    chunks_created: chunks.length,
    filename
  };
};
