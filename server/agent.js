import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';

import { vectorStore } from './embeddings.js';


// Tool to find similar documents
const findSimilarDocumentsTool = tool(
    async ({ query }) => {
        const retrievedDocs = await vectorStore.similaritySearch(query, 10);
        const documentIds = [...new Set(
            retrievedDocs.map((doc) => doc.metadata.document_id)
        )].slice(0, 5);
        console.log(documentIds);
        return documentIds.join('\n');
    },
    {
        name: 'findSimilarDocuments',
        description: 'Find documents similar to the query in the current selected document',
        schema: z.object({
            query: z.string().describe('The search query to find similar documents'),
        }),
    }
);



const llm = new ChatGoogleGenerativeAI({
    model: "gemini-1.5-flash",
    temperature: 0,
});

const checkpointer = new MemorySaver();

const retrieveTool = tool(
    async ({ query, document_id }) => {
        console.log('[RETRIEVE TOOL] Called with:', { query, document_id });

        const retrievedDocs = await vectorStore.similaritySearch(query, 3, {
            document_id,
        });

        console.log('[RETRIEVE TOOL] Found docs:', retrievedDocs.length);
        console.log('[RETRIEVE TOOL] Retrieved docs:', retrievedDocs);

        const serializedDocs = retrievedDocs
            .map((doc) => doc.pageContent)
            .join('\n');

        console.log('[RETRIEVE TOOL] Serialized content:', serializedDocs);
        return serializedDocs;
    },
    {
        name: 'retrieve',
        description: 'MANDATORY: Use this tool to retrieve relevant content from uploaded PDF documents. You MUST call this tool when users ask questions about document content. Extract the document_id from the user message.',
        schema: z.object({
            query: z.string().describe('The user\'s question or search query'),
            document_id: z.string().describe('The document ID extracted from the user message (format: Document ID: xxx)'),
        }),
    }
);

// Add system instruction to force tool usage
const systemPrompt = `You are a helpful assistant that answers questions about PDF documents. 

CRITICAL INSTRUCTIONS:
1. When a user asks about document content, you MUST use the retrieve tool
2. Extract the document_id from the user message (format: "Document ID: xxx")
3. Pass both the user's query and the document_id to the retrieve tool
4. Always use the retrieve tool before answering questions about documents
5. If you cannot find the document_id in the message, ask the user to specify which document they're asking about

Remember: You CANNOT answer questions about document content without using the retrieve tool first.`;

export const agent = createReactAgent({
    llm,
    tools: [retrieveTool, findSimilarDocumentsTool],
    checkpointer,
}).withConfig({
    configurable: {
        system_message: systemPrompt
    }
});
