import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';

import { vectorStore} from './embeddings.js';


// Modify retrieve tool for PDF context
const retrieveTool = tool(
    async ({ query, document_id }) => {
        const retrievedDocs = await vectorStore.similaritySearch(query, 3, {
            document_id,
        });
        console.log(retrievedDocs);
        const serializedDocs = retrievedDocs
            .map((doc) => doc.pageContent)
            .join('\n');
    console.log(serializedDocs);
        return serializedDocs;
    },
    {
        name: 'retrieve',
        description: 'Retrieve relevant chunks from uploaded PDF documents',
        schema: z.object({
            query: z.string(),
            document_id: z.string().describe('The ID of the document to retrieve from'),
        }),
    }
);


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

export const agent = createReactAgent({
    llm,
    tools: [
        retrieveTool,
        findSimilarDocumentsTool,
    ],
    checkpointer,
});
