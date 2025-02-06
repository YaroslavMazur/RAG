import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readCSV, scrapeArticle, getClusteredText} from './utils';
import { v4 as uuidv4 } from 'uuid';

export interface DocumentMetadata {
    [key: string]: string | number | boolean;
}

export interface DocumentData {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: DocumentMetadata;
}

export default class ChromaVectorDB {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private genAI: GoogleGenerativeAI;
  private csvFile: string;

  constructor(csvFile:string) {
    this.client = new ChromaClient({ path: "http://localhost:8000" });
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    this.csvFile = csvFile;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: "embedding-001" });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  async initializeCollection(collectionName: string): Promise<void> {
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: { "hnsw:space": "cosine" }
      });

      const collectionCount = await this.client.countCollections();

        if (collectionCount === 0) {
        await this.initDBfromCSV(this.csvFile);
        }

    } catch (error) {
      console.error('Collection initialization error:', error);
      throw error;
    }
  }

  async initDBfromCSV(csvFile: string) {
    try {
      const dataCSV = await readCSV(csvFile);
  
      const BATCH_SIZE = 5;
      const results = [];
  
      for (let i = 0; i < dataCSV.length; i += BATCH_SIZE) {
        const batch = dataCSV.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.all(
          batch.map(async ({ URL, Source }) => {
            try {
              const scrapedArticle = await scrapeArticle(URL);
              const splitedArticle = await getClusteredText(scrapedArticle.content);
  
              const chunks: DocumentData[] = splitedArticle.map((chunk, index) => ({
                id: `${URL}-${uuidv4()}-${index}`,
                content: `
                #${chunk.heading}\n
                ${chunk.content}\n
                Publication date:${scrapedArticle.time}
                url:${URL}\n
                `,
                metadata: {
                  category: "article",
                  title: scrapedArticle.title,
                  chunkTitle: chunk.heading,
                  time: scrapedArticle.time || "unknown",
                  url: URL,
                  source: Source
                }
              }));
  
              await this.addDocuments(chunks);
              return { success: true, url: URL };
            } catch (error) {
              return { success: false, url: URL, error };
            }
          })
        );
  
        results.push(...batchResults);
      }
  
      return results;
    } catch (error) {
      console.error('Critical error:', error);
      throw error;
    }
  }

  async addDocuments(documents: DocumentData[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection is not initialized');
    }

    try {
      const docsWithEmbeddings = await Promise.all(
        documents.map(async doc => ({
          ...doc,
          embedding: doc.embedding || await this.generateEmbedding(doc.content)
        }))
      );

      await this.collection.add({
        ids: docsWithEmbeddings.map(doc => doc.id),
        embeddings: docsWithEmbeddings.map(doc => doc.embedding),
        metadatas: docsWithEmbeddings.map(doc => doc.metadata || {}),
        documents: docsWithEmbeddings.map(doc => doc.content)
      });
    } catch (error) {
      console.error('Error adding documents:', error);
      throw error;
    }
  }

  async queryDocuments(
    queryText: string,
    topK: number = 5
  ): Promise<DocumentData[]> {
    if (!this.collection) {
      throw new Error('Collection is not initialized');
    }

    try {
      const queryEmbedding = await this.generateEmbedding(queryText);

      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        include: ["documents", "metadatas", "embeddings"] as IncludeEnum[]
      });

      if (!results.ids || !results.documents || !results.embeddings || !results.metadatas) {
        throw new Error('Invalid response structure');
      }

      return results.ids[0].map((id, index) => ({
        id: id.toString(),
        content: results.documents[0][index]?.toString() || '',
        embedding: results.embeddings![0][index] as number[],
        metadata: results.metadatas[0][index] as DocumentMetadata,
      }));
    } catch (error) {
      console.error('Error querying documents:', error);
      throw error;
    }
  }

  async updateDocument(document: DocumentData): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection is not initialized');
    }

    try {
      await this.collection.update({
        ids: [document.id],
        embeddings: [document.embedding as number[]],
        metadatas: [document.metadata || {}],
        documents: [document.content]
      });
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection is not initialized');
    }

    try {
      await this.collection.delete({ ids });
    } catch (error) {
      console.error('Error deleting documents:', error);
      throw error;
    }
  }
}
