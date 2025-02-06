import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function* generateStreamingResponse(
  prompt: string
): AsyncGenerator<string, void, unknown> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const streamingResp = await model.generateContentStream(prompt);

    for await (const chunk of streamingResp.stream) {
      const chunkText = chunk.text();
      yield chunkText;
    }
  } catch (error) {
    console.error("Помилка при генерації відповіді:", error);
    throw new Error("Не вдалося згенерувати відповідь");
  }
}

export async function generateResponse(prompt: string): Promise<string> {
  let fullResponse = "";
  const stream = generateStreamingResponse(prompt);
  
  for await (const chunk of stream) {
    fullResponse += chunk;
  }
  
  return fullResponse;
}