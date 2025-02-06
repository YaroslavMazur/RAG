import express from 'express';
import type { Request, Response } from 'express';
import { generateStreamingResponse, generateResponse } from "./gemini";
import ChromaVectorDB from "./vectorDB";
import { scrapeArticle } from './utils';

const app = express();
app.use(express.json());
const PORT = 3000;
const csvFile = "articles_dataset.csv"

const clientDB = new ChromaVectorDB(csvFile); 


app.post('/search', async (req: Request, res: Response) => {
  const { query } = req.body;
  try {
    const chunks = await clientDB.queryDocuments(query);
    res.json({ chunks });
  } catch (error) {
    console.error("Error querying", error);
  }
});

app.post('/agent', async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");

  const { query } = req.body;
  try {
    let context = "";

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = query.match(urlRegex);

    if (urls && urls.length > 0) {
      const url = urls[0];
      const articleData = await scrapeArticle(url);
      context = articleData.content;
    } else {
      let chunks = await clientDB.queryDocuments(query, 7);
      context = chunks.map((chunk) => chunk.content).join("\n\n\n");
    }

    const prompt = `
        You are a virtual assistant specializing in providing accurate and useful answers.
        Analyze the context and provide a comprehensive response.
        If the context does not contain enough information to provide a complete answer, state that you do not know.

        Question: "${query}"

        Context:"${context}"
      `;

    for await (const chunk of generateStreamingResponse(prompt)) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    res.status(500).json({ error: "Error generating text" });
  }
});


async function main() {
  await clientDB.initializeCollection("test_rag");
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

main();
