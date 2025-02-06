import fs from "fs";
import csv from "csv-parser";
import axios from "axios";
import * as cheerio from "cheerio";
import { generateResponse } from "./gemini";

interface Article {
  Source: string;
  URL: string;
}

interface ProcessedArticle {
  title: string;
  content: string;
  url: string;
  time: string | null;
}

interface TextBlock {
    heading: string;
    content: string;
  }

export async function readCSV(fileName: string): Promise<Article[]> {
  return new Promise((resolve, reject) => {
    const results: Article[] = [];
    fs.createReadStream(`./data/${fileName}`)
      .pipe(csv({ headers: ["Source", "URL"], skipLines: 1 }))
      .on("data", (row: Article) => results.push(row))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

export async function scrapeArticle(url: string): Promise<ProcessedArticle> {
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);

    const title = $("h1").first().text().trim();
    const time = $("time").first().text().trim() || null;

    const elements: { type: string; text: string }[] = [];
    $("body")
      .find("h1, h2, h3, p, ul, li")
      .each((_, el) => {
        const tagName = $(el).prop("tagName").toLowerCase();
        const text = $(el).text().trim();

        if (text) {
          elements.push({ type: tagName, text });
        }
      });

    const markdownLines: string[] = [];
    let inList = false; 

    elements.forEach((element) => {
      switch (element.type) {
        case "h1":
          markdownLines.push(`# ${element.text}`);
          break;
        case "h2":
          markdownLines.push(`## ${element.text}`);
          break;
        case "h3":
          markdownLines.push(`### ${element.text}`);
          break;
        case "p":
          markdownLines.push(element.text);
          break;
        case "ul":
          if (!inList) {
            markdownLines.push("");
            inList = true;
          }
          break;
        case "li":
          if (inList) {
            markdownLines.push(`- ${element.text}`);
          }
          break;
      }
    });

    if (title) {
      markdownLines.unshift(`# ${title}`);
    }
    if (time) {
      markdownLines.unshift(`**Publication date:** ${time}`);
    }
    const markdown = markdownLines.join("\n\n");

    return { 
      title, 
      content: markdown, 
      url,
      time
    }
  } catch (error) {
    console.error(`Error fetching: ${url}`, (error as Error).message);
    return {
      title: "Can not load information",
      content: "",
      url,
      time: null
    };
  }
}

export async function getClusteredText(text: string): Promise<TextBlock[]> {
  const MAX_RETRIES = 1;
  const MIN_CONTENT_LENGTH = 100;
  
  const sanitizedText = text.replace(/"/g, "'");

  const prompt = `
  You are given a set of rules and an article's text scraped from a news website in markdown.
  Strictly follow these rules to structure the article into logical blocks:

  1. Analyze hierarchical structure.
  2. Split the text into logical blocks:
     - "heading": heading text
     - "content": 3-5 related paragraphs
  3. If no headings found:
     - Create logical sections by topic
  4. Preserve all key information
  5. Remove non-content elements (ads, comments, navigation, everything not related to the article)

  Return a JSON array:
  [{
    "heading": "Section Title",
    "content": "Text content..."
  },...]

  Article text: "${sanitizedText}"
  `;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let answer = await generateResponse(prompt);

      answer = answer
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const parsed = JSON.parse(answer) as TextBlock[];

      const isValid = Array.isArray(parsed) && 
        parsed.every(b => 
          typeof b.heading === 'string' && 
          typeof b.content === 'string' &&
          b.content.length >= MIN_CONTENT_LENGTH
        );
      
      if (!isValid) throw new Error('Invalid structure');

      return parsed;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
    }
  }
  return [];
}