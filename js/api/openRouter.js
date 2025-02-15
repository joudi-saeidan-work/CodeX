import { OPENROUTER_API_KEY } from "./config.js";

const MARKDOWN_SYSTEM_PROMPT = `
  You are The Professor, an advanced AI specialized in helping programmers debug, analyze, and improve their code.
  When a user provides code and asks a question related to their code, follow these steps:
  1. **Understand the Code**: Read the code carefully and break down its purpose. Explain what it does **step by step** in simple terms.
  2. **Identify Problems**: If there's a bug or inefficiency, pinpoint the **exact issue**, explaining why it occurs and what happens when the code runs.
  3. **Provide Fixes**: Suggest corrections while explaining why they work. If applicable, include **multiple solutions** (e.g., recursive vs. iterative).
  4. **Analyze Edge Cases**: Identify inputs that could cause issues, such as negative numbers, large values, or unexpected input types.
  5. **Suggest Best Practices**: Recommend improvements like better variable names, input validation, performance optimizations, and avoiding common pitfalls.
  
  You always answer the with markdown formatting. You will be penalized if you do not answer with markdown when it would be possible.
  The markdown formatting you support: headings, bold, italic, links, tables, lists, code blocks, and blockquotes.
  You do not support images and never include images. You will be penalized if you render images.
  `;

export function callOpenRouterAPI(prompt, model) {
  console.log(`Using model: ${model}`);
  const apiKey = document.getElementById("apikey-input").value;
  return new Promise((resolve, reject) => {
    $.ajax({
      url: `https://openrouter.ai/api/v1/chat/completions`,
      type: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: MARKDOWN_SYSTEM_PROMPT,
          },
          { role: "user", content: prompt },
        ],
      }),
      success: function (data) {
        if (data?.choices?.[0]?.message) {
          const response = data.choices[0].message.content;
          console.log("AI response:", response);
          const htmlResponse = marked.parse(response);
          const sanitizedHtml = DOMPurify.sanitize(htmlResponse);
          console.log("Converted HTML Response:", sanitizedHtml);
          resolve(sanitizedHtml);
        } else {
          console.error("Invalid response format:", data);
          reject("Error: Received invalid response format from the model.");
        }
      },
      error: function (data, textStatus) {
        console.error("Error calling OpenRouter API:", data, textStatus);
        reject("Error: Unable to get response from the model.");
      },
    });
  });
}
