let lastCallTime = 0;
const MIN_DELAY = 1000; // 1 second minimum between calls

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

const ERROR_HELP_SYSTEM_PROMPT = `
  You are an expert programming assistant. When a user encounters an error:
  
  1. Analyze the entire codebase for ALL potential issues
  2. Prioritize errors by severity (syntax > runtime > logic)
  3. Show fixes for ALL found errors in order of priority
  4. Verify fixes don't introduce new errors
  
  **Response Format:**
  ERROR_ANALYSIS: <1-2 sentence explanation of the error>
  
  DIFF:
  <Show only the lines that need to change, using the following format:>
  - <line to remove>
  + <line to add>
  
  EXPLANATION: <1-2 sentence explanation of the fix>
  
  **Rules:**
  1. Always use the exact format above. Do not include additional text before or after the sections.
  2. For the DIFF section:
     - Only include lines that need to change.
     - Use "-" for lines to remove and "+" for lines to add.
     - Do not include unchanged lines or context.
     - Preserve all indentation exactly as it should appear in the fixed code.
  3. For Python code, ensure indentation is correct and consistent.
  4. If the error involves missing or extra brackets, quotes, or parentheses, show the exact fix.
  5. If the error is due to incorrect indentation, show the exact corrected indentation.
  6. Keep the response concise and focused only on the syntax error.
  
  **Example 1:**
  ERROR_ANALYSIS: Missing colon at the end of the function definition.
  
  DIFF:
  - def my_function()
  + def my_function():
  
  EXPLANATION: Added a colon at the end of the function definition to fix the syntax error.
  
  **Example 2:**
  ERROR_ANALYSIS: Incorrect indentation in the try-except block.
  
  DIFF:
  -     try:
  - print("Hello")
  -     except:
  - print("Error")
  +     try:
  +         print("Hello")
  +     except:
  +         print("Error")
  
  EXPLANATION: Fixed the indentation inside the try-except block to align with Python's syntax rules.
  
  **Example 3:**
  ERROR_ANALYSIS: Missing closing parenthesis in the print statement.
  
  DIFF:
  - print("Hello"
  + print("Hello")
  
  EXPLANATION: Added the missing closing parenthesis to fix the syntax error.
  `;

// const AUTO_COMPLETE_SYSTEM_PROMPT = `
//   You are a helpful assistant that can help with code completion.
//   You will be given a line of code and a cursor position.
//   You will need to return the next line of code that the user should type.
//   `;

const AUTO_COMPLETE_SYSTEM_PROMPT = `
You are a multi-language code completion assistant. Your task is to provide accurate and relevant code completions in various programming languages, including JavaScript, Python, and Java. Be concise and only provide the most relevant suggestions. Do not include explanations or additional text. Consider the surrounding code and provide context-aware suggestions. For example:
- In JavaScript, if the user types "for (let i = 0; i <", suggest "i < array.length".
- In Python, if the user types "for i in range(", suggest "for i in range(len(array)).
  `;

export function callOpenRouterAPI(prompt, model, task) {
  console.log(`Using model: ${model}`);
  const apiKey = localStorage.getItem("OPENROUTER_API_KEY");

  return new Promise((resolve, reject) => {
    // Check if we're calling too soon
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;
    if (timeSinceLastCall < MIN_DELAY) {
      reject(
        new Error(
          `Please wait ${((MIN_DELAY - timeSinceLastCall) / 1000).toFixed(
            1
          )} seconds before making another request`
        )
      );
      return;
    }

    lastCallTime = now;

    if (!apiKey) {
      reject(new Error("Please enter and save your OpenRouter API key first"));
      return;
    }

    let systemPrompt;
    if (task === "autoComplete") {
      systemPrompt = AUTO_COMPLETE_SYSTEM_PROMPT;
    } else if (task === "errorHelp") {
      systemPrompt = ERROR_HELP_SYSTEM_PROMPT;
    } else {
      systemPrompt = MARKDOWN_SYSTEM_PROMPT;
    }

    const requestData = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        { role: "user", content: prompt },
      ],
    };

    $.ajax({
      url: "https://openrouter.ai/api/v1/chat/completions",
      type: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: JSON.stringify(requestData),
      success: function (data) {
        console.log("Raw API Response:", JSON.stringify(data, null, 2));
        // Check for error structure first
        if (data?.error) {
          const error = new Error(data.error.message);
          error.code = data.error.code;
          error.metadata = data.error.metadata;
          reject(error);
          return;
        }

        // Then check for valid response format
        if (!data?.choices?.[0]?.message?.content) {
          reject(new Error("Invalid response format from API"));
          return;
        }

        const response = data.choices[0].message.content;
        processResponse(response, task, resolve);
      },
      error: function (xhr) {
        // Handle HTTP errors
        const error = new Error(
          xhr.responseJSON?.error?.message || xhr.statusText
        );
        error.code = xhr.status;
        reject(error);
      },
    });
  });
}

function processResponse(response, type, resolve) {
  if (type === "errorHelp") {
    resolve(response);
    return;
  }

  if (type === "chat") {
    const htmlResponse = marked.parse(response);
    const sanitizedHtml = DOMPurify.sanitize(htmlResponse);
    console.log("Converted HTML Response:", sanitizedHtml);
    resolve(sanitizedHtml);
    return;
  }

  // Default case if needed
  resolve(response);
}
