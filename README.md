# Project Setup Guide

This guide walks you through setting up the project.

## Prerequisites
- Node.js v18+
- npm/yarn
- Docker installed

## 1. Get Google Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create API key for Gemini
3. Copy the generated key
4. Create an .env file in the root of your project and add your API key to it:
```bash
GEMINI_API_KEY=your_api_key_here
```

## 2. Install Dependencies
```bash
npm install
```

## 3. Chroma setup
```bash
docker pull chromadb/chroma
docker run -p 8000:8000 chromadb/chroma
```
## 4. Run the project
```bash
npm run start:dev
```
