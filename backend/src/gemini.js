// backend/src/gemini.js

require('dotenv').config();
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "text-embedding-004";

if (!GEMINI_API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

/**
 * Call Gemini to generate a natural language reply using KB snippets.
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Gemini Text Error:", data);
      return "AI Error: Unable to generate response.";
    }

    const output =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join(" ").trim() ||
      "I'm not sure, could you rephrase?";

    return output;
  } catch (err) {
    console.error("❌ generateAIReply Error:", err);
    return "AI Error: Something went wrong while generating a reply.";
  }
}

/**
 * Create embeddings using Gemini "text-embedding-004".
 */
async function embedText(text) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            parts: [{ text }]
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Gemini Embedding Error:", data);
      return [];
    }

    return data?.embedding?.values || [];

  } catch (err) {
    console.error("❌ embedText Error:", err);
    return [];
  }
}

module.exports = {
  generateAIReply,
  embedText,
};
