// backend/src/gemini.js

require('dotenv').config();
const Groq = require('groq-sdk');
const { InferenceClient } = require('@huggingface/inference');

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const HF_EMBED_MODEL = process.env.HF_EMBED_MODEL || "BAAI/bge-base-en-v1.5";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const hfClient = process.env.HF_API_TOKEN ? new InferenceClient(process.env.HF_API_TOKEN) : null;

if (!groq) {
  console.error("❌ Missing GROQ_API_KEY in .env");
  process.exit(1);
}

/**
 * Generate a natural language reply using KB snippets via Groq (Llama 3.3 70B).
 */
async function generateAIReply({
  userMessage,
  kbMatches = [],
  systemInstruction = "You are a helpful customer support assistant for this business. Use the provided knowledge base snippets as the main source of truth. If the answer is not clearly in the snippets, you can answer from general knowledge but keep it relevant to the business.",
}) {
  try {
    const kbContext = kbMatches
      .map(
        (m, i) =>
          `Snippet ${i + 1} (from "${m.title}", score: ${m.score?.toFixed?.(3) ?? "n/a"}):\n${m.text}`
      )
      .join("\n\n");

    const userPrompt = kbMatches.length
      ? `Use these knowledge base snippets when relevant:\n\n${kbContext}\n\nUser question:\n${userMessage}`
      : `No knowledge base snippets were retrieved.\n\nUser question:\n${userMessage}`;

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const output = completion.choices?.[0]?.message?.content?.trim() ||
      "I'm not sure, could you rephrase?";

    return output;
  } catch (err) {
    console.error("❌ generateAIReply Error:", err);
    return "AI Error: Something went wrong while generating a reply.";
  }
}

/**
 * Create embeddings using Hugging Face Inference SDK (BAAI/bge-base-en-v1.5).
 */
async function embedText(text) {
  try {
    if (!hfClient) {
      console.error("❌ Missing HF_API_TOKEN in .env");
      return [];
    }

    const output = await hfClient.featureExtraction({
      model: HF_EMBED_MODEL,
      inputs: text,
      provider: "hf-inference",
    });

    if (Array.isArray(output) && typeof output[0] === 'number') {
      return output;
    }
    if (Array.isArray(output) && Array.isArray(output[0])) {
      return output[0];
    }

    console.error("❌ Unexpected HF embedding response format:", typeof output);
    return [];

  } catch (err) {
    console.error("❌ embedText Error:", err);
    return [];
  }
}

module.exports = {
  generateAIReply,
  embedText,
};
