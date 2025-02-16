import { callOpenRouterAPI } from "./api/openRouter.js";
import { IS_PUTER } from "./puter.js";

const API_KEY = ""; // Get yours at https://platform.sulu.sh/apis/judge0

const AUTH_HEADERS = API_KEY
  ? {
      Authorization: `Bearer ${API_KEY}`,
    }
  : {};

const CE = "CE";

const EXTRA_CE = "EXTRA_CE";

const AUTHENTICATED_CE_BASE_URL = "https://judge0-ce.p.sulu.sh";

const AUTHENTICATED_EXTRA_CE_BASE_URL = "https://judge0-extra-ce.p.sulu.sh";

var AUTHENTICATED_BASE_URL = {};

AUTHENTICATED_BASE_URL[CE] = AUTHENTICATED_CE_BASE_URL;

AUTHENTICATED_BASE_URL[EXTRA_CE] = AUTHENTICATED_EXTRA_CE_BASE_URL;

const UNAUTHENTICATED_CE_BASE_URL = "https://ce.judge0.com";

const UNAUTHENTICATED_EXTRA_CE_BASE_URL = "https://extra-ce.judge0.com";

var UNAUTHENTICATED_BASE_URL = {};

UNAUTHENTICATED_BASE_URL[CE] = UNAUTHENTICATED_CE_BASE_URL;

UNAUTHENTICATED_BASE_URL[EXTRA_CE] = UNAUTHENTICATED_EXTRA_CE_BASE_URL;

const INITIAL_WAIT_TIME_MS = 0;

const WAIT_TIME_FUNCTION = (i) => 100;

const MAX_PROBE_REQUESTS = 50;

var fontSize = 13;

var layout;

var sourceEditor;

var stdinEditor;

var stdoutEditor;

var $selectLanguage;

var $compilerOptions;

var $commandLineArguments;

var $runBtn;

var $statusLine;

var timeStart;

var sqliteAdditionalFiles;

var languages = {};

var layoutConfig = {
  settings: {
    showPopoutIcon: false,

    reorderEnabled: true,
  },

  content: [
    {
      type: "row",

      content: [
        {
          type: "component",

          width: 60,

          componentName: "source",

          id: "source",

          title: '<span class="fa fa-code"></span> Source Code',

          isClosable: false,

          componentState: {
            readOnly: false,
          },
        },

        {
          type: "column",

          width: 40,

          content: [
            {
              type: "stack",

              height: 50,

              content: [
                {
                  type: "component",

                  componentName: "stdin",

                  id: "stdin",

                  title: '<span class="fa fa-keyboard"></span> Input',

                  isClosable: false,

                  componentState: {
                    readOnly: false,
                  },
                },

                {
                  type: "component",

                  componentName: "stdout",

                  id: "stdout",

                  title: '<span class="fa fa-terminal"></span> Output',

                  isClosable: false,

                  componentState: {
                    readOnly: true,
                  },
                },
              ],
            },

            {
              type: "stack",

              height: 100,
              content: [
                {
                  type: "component",

                  componentName: "professor",

                  id: "professor",

                  title: `  
                        The Professor
                      `,

                  isClosable: false,

                  componentState: {
                    readOnly: true,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

var gPuterFile;

function encode(str) {
  return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
  var escaped = escape(atob(bytes || ""));

  try {
    return decodeURIComponent(escaped);
  } catch {
    return unescape(escaped);
  }
}

function showError(title, content) {
  $("#judge0-site-modal #title").html(title);

  $("#judge0-site-modal .content").html(content);

  let reportTitle = encodeURIComponent(`Error on ${window.location.href}`);

  let reportBody = encodeURIComponent(
    `**Error Title**: ${title}\n` +
      `**Error Timestamp**: \`${new Date()}\`\n` +
      `**Origin**: ${window.location.href}\n` +
      `**Description**:\n${content}`
  );

  $("#report-problem-btn").attr(
    "href",

    `https://github.com/judge0/ide/issues/new?title=${reportTitle}&body=${reportBody}`
  );

  $("#judge0-site-modal").modal("show");
}

function showHttpError(jqXHR) {
  showError(
    `${jqXHR.statusText} (${jqXHR.status})`,

    `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`
  );
}

function handleAPIError(thinkingMsg, error) {
  thinkingMsg.remove();

  let message = error.message;
  if (error.code === 429) {
    const resetTime = error.metadata?.headers?.["X-RateLimit-Reset"];
    if (resetTime) {
      const resetDate = new Date(parseInt(resetTime));
      message += `\nResets at: ${resetDate.toLocaleString()}`;
    }
    message += "\nConsider upgrading at https://openrouter.ai/upgrade";
  }

  addMessageToChat("error", `API Error: ${message}`);
  console.error("API Error:", error);
}

function detectError(output) {
  return (
    output.toLowerCase().includes("error") ||
    output.toLowerCase().includes("exception")
  );
}

// handles https errors and api errors

function handleRunError(jqXHR) {
  showHttpError(jqXHR);

  $runBtn.removeClass("disabled");

  window.top.postMessage(
    JSON.parse(
      JSON.stringify({
        event: "runError",

        data: jqXHR,
      })
    ),

    "*"
  );
}

function handleResult(data) {
  const tat = Math.round(performance.now() - timeStart);

  console.log(`It took ${tat}ms to get submission result.`);

  const status = data.status || {};

  const stdout = decode(data.stdout);

  const compileOutput = decode(data.compile_output);

  const time = data.time === null ? "-" : data.time + "s";

  const memory = data.memory === null ? "-" : data.memory + "KB";

  $statusLine.html(
    `${status.description || "Unknown"}, ${time}, ${memory} (TAT: ${tat}ms)`
  );

  const output = [compileOutput, stdout].join("\n").trim();

  stdoutEditor.setValue(output);

  // check for compliation error or runtime error

  if (compileOutput || (status && status.id > 3)) {
    const errorMsg = `Runtime Error (${status.description}), ${time}, ${memory} (TAT: ${tat}ms)\n\n${output}`;

    stdoutEditor.setValue(errorMsg);

    console.log(output);

    checkForErrorAndOffer(output);
  }

  $runBtn.removeClass("disabled");

  window.top.postMessage(
    JSON.parse(
      JSON.stringify({
        event: "postExecution",

        status: status,

        time: data.time,

        memory: data.memory,

        output: output,
      })
    ),

    "*"
  );
}

async function getSelectedLanguage() {
  return getLanguage(getSelectedLanguageFlavor(), getSelectedLanguageId());
}

function getSelectedLanguageId() {
  return parseInt($selectLanguage.val());
}

function getSelectedLanguageFlavor() {
  return $selectLanguage.find(":selected").attr("flavor");
}

function run() {
  if (sourceEditor.getValue().trim() === "") {
    showError("Error", "Source code can't be empty!");
    return;
  } else {
    $runBtn.addClass("disabled");
  }

  stdoutEditor.setValue("");
  $statusLine.html("");

  let x = layout.root.getItemsById("stdout")[0];
  x.parent.header.parent.setActiveContentItem(x);

  let sourceValue = encode(sourceEditor.getValue());
  let stdinValue = encode(stdinEditor.getValue());
  let languageId = getSelectedLanguageId();
  let compilerOptions = $compilerOptions.val();
  let commandLineArguments = $commandLineArguments.val();

  let flavor = getSelectedLanguageFlavor();

  if (languageId === 44) {
    sourceValue = sourceEditor.getValue();
  }
  // this is what gets send to the judge 0 api to execute the code
  let data = {
    source_code: sourceValue,
    language_id: languageId,
    stdin: stdinValue,
    compiler_options: compilerOptions,
    command_line_arguments: commandLineArguments,
    redirect_stderr_to_stdout: true,
  };

  let sendRequest = function (data) {
    window.top.postMessage(
      JSON.parse(
        JSON.stringify({
          event: "preExecution",
          source_code: sourceEditor.getValue(),
          language_id: languageId,
          flavor: flavor,
          stdin: stdinEditor.getValue(),
          compiler_options: compilerOptions,
          command_line_arguments: commandLineArguments,
        })
      ),
      "*"
    );

    timeStart = performance.now();
    $.ajax({
      url: `${AUTHENTICATED_BASE_URL[flavor]}/submissions?base64_encoded=true&wait=false`,
      type: "POST",
      contentType: "application/json",
      data: JSON.stringify(data),
      headers: AUTH_HEADERS,
      success: function (data, textStatus, request) {
        console.log(`Your submission token is: ${data.token}`);
        let region = request.getResponseHeader("X-Judge0-Region");
        setTimeout(
          fetchSubmission.bind(null, flavor, region, data.token, 1),
          INITIAL_WAIT_TIME_MS
        );
      },
      error: handleRunError,
    });
  };

  if (languageId === 82) {
    if (!sqliteAdditionalFiles) {
      $.ajax({
        url: `./data/additional_files_zip_base64.txt`,
        contentType: "text/plain",
        success: function (responseData) {
          sqliteAdditionalFiles = responseData;
          data["additional_files"] = sqliteAdditionalFiles;
          sendRequest(data);
        },
        error: handleRunError,
      });
    } else {
      data["additional_files"] = sqliteAdditionalFiles;
      sendRequest(data);
    }
  } else {
    sendRequest(data);
  }
}

function fetchSubmission(flavor, region, submission_token, iteration) {
  if (iteration >= MAX_PROBE_REQUESTS) {
    handleRunError(
      {
        statusText: "Maximum number of probe requests reached.",
        status: 504,
      },
      null,
      null
    );
    return;
  }

  $.ajax({
    url: `${UNAUTHENTICATED_BASE_URL[flavor]}/submissions/${submission_token}?base64_encoded=true`,
    headers: {
      "X-Judge0-Region": region,
    },
    success: function (data) {
      if (data.status.id <= 2) {
        // In Queue or Processing
        $statusLine.html(data.status.description);
        setTimeout(
          fetchSubmission.bind(
            null,
            flavor,
            region,
            submission_token,
            iteration + 1
          ),
          WAIT_TIME_FUNCTION(iteration)
        );
      } else {
        handleResult(data);
      }
    },
    error: handleRunError,
  });
}

function setSourceCodeName(name) {
  $(".lm_title")[0].innerText = name;
}

function getSourceCodeName() {
  return $(".lm_title")[0].innerText;
}

function openFile(content, filename) {
  clear();
  sourceEditor.setValue(content);
  selectLanguageForExtension(filename.split(".").pop());
  setSourceCodeName(filename);
}

function saveFile(content, filename) {
  const blob = new Blob([content], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

async function openAction() {
  if (IS_PUTER) {
    gPuterFile = await puter.ui.showOpenFilePicker();
    openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
  } else {
    document.getElementById("open-file-input").click();
  }
}

async function saveAction() {
  if (IS_PUTER) {
    if (gPuterFile) {
      gPuterFile.write(sourceEditor.getValue());
    } else {
      gPuterFile = await puter.ui.showSaveFilePicker(
        sourceEditor.getValue(),
        getSourceCodeName()
      );
      setSourceCodeName(gPuterFile.name);
    }
  } else {
    saveFile(sourceEditor.getValue(), getSourceCodeName());
  }
}

function setFontSizeForAllEditors(fontSize) {
  sourceEditor.updateOptions({ fontSize: fontSize });
  stdinEditor.updateOptions({ fontSize: fontSize });
  stdoutEditor.updateOptions({ fontSize: fontSize });
}

async function loadLangauges() {
  return new Promise((resolve, reject) => {
    let options = [];

    $.ajax({
      url: UNAUTHENTICATED_CE_BASE_URL + "/languages",
      success: function (data) {
        for (let i = 0; i < data.length; i++) {
          let language = data[i];
          let option = new Option(language.name, language.id);
          option.setAttribute("flavor", CE);
          option.setAttribute(
            "langauge_mode",
            getEditorLanguageMode(language.name)
          );

          if (language.id !== 89) {
            options.push(option);
          }

          if (language.id === DEFAULT_LANGUAGE_ID) {
            option.selected = true;
          }
        }
      },
      error: reject,
    }).always(function () {
      $.ajax({
        url: UNAUTHENTICATED_EXTRA_CE_BASE_URL + "/languages",
        success: function (data) {
          for (let i = 0; i < data.length; i++) {
            let language = data[i];
            let option = new Option(language.name, language.id);
            option.setAttribute("flavor", EXTRA_CE);
            option.setAttribute(
              "langauge_mode",
              getEditorLanguageMode(language.name)
            );

            if (
              options.findIndex((t) => t.text === option.text) === -1 &&
              language.id !== 89
            ) {
              options.push(option);
            }
          }
        },
        error: reject,
      }).always(function () {
        options.sort((a, b) => a.text.localeCompare(b.text));
        $selectLanguage.append(options);
        resolve();
      });
    });
  });
}

async function loadSelectedLanguage(skipSetDefaultSourceCodeName = false) {
  monaco.editor.setModelLanguage(
    sourceEditor.getModel(),
    $selectLanguage.find(":selected").attr("langauge_mode")
  );

  if (!skipSetDefaultSourceCodeName) {
    setSourceCodeName((await getSelectedLanguage()).source_file);
  }
}

function selectLanguageByFlavorAndId(languageId, flavor) {
  let option = $selectLanguage.find(`[value=${languageId}][flavor=${flavor}]`);
  if (option.length) {
    option.prop("selected", true);
    $selectLanguage.trigger("change", { skipSetDefaultSourceCodeName: true });
  }
}

function selectLanguageForExtension(extension) {
  let language = getLanguageForExtension(extension);
  selectLanguageByFlavorAndId(language.language_id, language.flavor);
}

async function getLanguage(flavor, languageId) {
  return new Promise((resolve, reject) => {
    if (languages[flavor] && languages[flavor][languageId]) {
      resolve(languages[flavor][languageId]);
      return;
    }

    $.ajax({
      url: `${UNAUTHENTICATED_BASE_URL[flavor]}/languages/${languageId}`,
      success: function (data) {
        if (!languages[flavor]) {
          languages[flavor] = {};
        }

        languages[flavor][languageId] = data;
        resolve(data);
      },
      error: reject,
    });
  });
}

function setDefaults() {
  setFontSizeForAllEditors(fontSize);
  sourceEditor.setValue(DEFAULT_SOURCE);
  stdinEditor.setValue(DEFAULT_STDIN);
  $compilerOptions.val(DEFAULT_COMPILER_OPTIONS);
  $commandLineArguments.val(DEFAULT_CMD_ARGUMENTS);

  $statusLine.html("");

  loadSelectedLanguage();
}

function clear() {
  sourceEditor.setValue("");
  stdinEditor.setValue("");
  $compilerOptions.val("");
  $commandLineArguments.val("");

  $statusLine.html("");
}

function refreshSiteContentHeight() {
  const navigationHeight = document.getElementById(
    "judge0-site-navigation"
  ).offsetHeight;

  const siteContent = document.getElementById("judge0-site-content");
  siteContent.style.height = `${window.innerHeight}px`;
  siteContent.style.paddingTop = `${navigationHeight}px`;
}

function refreshLayoutSize() {
  refreshSiteContentHeight();
  layout.updateSize();
}

window.addEventListener("resize", refreshLayoutSize);
document.addEventListener("DOMContentLoaded", async function () {
  $("#select-language").dropdown();
  $("[data-content]").popup({
    lastResort: "left center",
  });

  refreshSiteContentHeight();

  console.log(
    "Hey, Judge0 IDE is open-sourced: https://github.com/judge0/ide. Have fun!"
  );

  $selectLanguage = $("#select-language");
  $selectLanguage.change(function (event, data) {
    let skipSetDefaultSourceCodeName =
      (data && data.skipSetDefaultSourceCodeName) || !!gPuterFile;
    loadSelectedLanguage(skipSetDefaultSourceCodeName);
  });

  await loadLangauges();

  $compilerOptions = $("#compiler-options");
  $commandLineArguments = $("#command-line-arguments");

  $runBtn = $("#run-btn");
  $runBtn.click(run);

  $("#open-file-input").change(function (e) {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = function (e) {
        openFile(e.target.result, selectedFile.name);
      };

      reader.onerror = function (e) {
        showError("Error", "Error reading file: " + e.target.error);
      };

      reader.readAsText(selectedFile);
    }
  });

  $statusLine = $("#judge0-status-line");

  $(document).on("keydown", "body", function (e) {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key) {
        case "Enter": // Ctrl+Enter, Cmd+Enter
          e.preventDefault();
          run();
          break;
        case "s": // Ctrl+S, Cmd+S
          e.preventDefault();
          save();
          break;
        case "o": // Ctrl+O, Cmd+O
          e.preventDefault();
          open();
          break;
        case "+": // Ctrl+Plus
        case "=": // Some layouts use '=' for '+'
          e.preventDefault();
          fontSize += 1;
          setFontSizeForAllEditors(fontSize);
          break;
        case "-": // Ctrl+Minus
          e.preventDefault();
          fontSize -= 1;
          setFontSizeForAllEditors(fontSize);
          break;
        case "0": // Ctrl+0
          e.preventDefault();
          fontSize = 13;
          setFontSizeForAllEditors(fontSize);
          break;
      }
    }
  });

  require(["vs/editor/editor.main"], function (ignorable) {
    layout = new GoldenLayout(layoutConfig, $("#judge0-site-content"));

    layout.registerComponent("source", function (container, state) {
      sourceEditor = monaco.editor.create(container.getElement()[0], {
        automaticLayout: true,
        scrollBeyondLastLine: true,
        readOnly: state.readOnly,
        language: "cpp",
        fontFamily: "JetBrains Mono",
        minimap: {
          enabled: true,
        },
      });

      // need to change this UI
      sourceEditor.addAction({
        id: "add-to-chat",

        label: "Add to Chat",

        contextMenuGroupId: "navigation",

        contextMenuOrder: 1.5,

        run: function (editor) {
          const selection = editor.getSelection();

          const selectedText = editor.getModel().getValueInRange(selection);

          if (selectedText.trim()) {
            addSelectedTextToChat(selectedText);
          }
        },
      });

      sourceEditor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        run,
        // trigger monaco's built in auto complete (has syntax understanding only)
        sourceEditor.trigger("", "editor.action.triggerSuggest", "")
      );
      // if the user the user presses ctrl+space, trigger the auto complete
      sourceEditor.onDidChangeModelContent(function (e) {
        const text = sourceEditor.getValue(); // get the entire text of the editor
        const cursorPosition = sourceEditor.getPosition(); // get the cursor position
        const lineContent = sourceEditor
          .getModel()
          .getLineContent(cursorPosition.lineNumber); // gets the content of the line that the cursor is on

        // call our auto complete function (sends a request to get the AI response)
        handleAutoComplete(text, lineContent, cursorPosition);
      });
    });

    layout.registerComponent("stdin", function (container, state) {
      stdinEditor = monaco.editor.create(container.getElement()[0], {
        automaticLayout: true,
        scrollBeyondLastLine: false,
        readOnly: state.readOnly,
        language: "plaintext",
        fontFamily: "JetBrains Mono",
        minimap: {
          enabled: false,
        },
      });
    });

    layout.registerComponent("stdout", function (container, state) {
      stdoutEditor = monaco.editor.create(container.getElement()[0], {
        automaticLayout: true,
        scrollBeyondLastLine: false,
        readOnly: state.readOnly,
        language: "plaintext",
        fontFamily: "JetBrains Mono",
        minimap: {
          enabled: false,
        },
      });
    });
    // professor
    layout.registerComponent("professor", function (container, state) {
      const $container = container.getElement();
      $container.html(`
              <div class="professor-header">
                <select id="model-selector" class="ui compact dropdown">
                  <option value="google/gemini-2.0-flash-thinking-exp:free">Google: Gemini Flash Lite 2.0 Preview (free)</option>
                  <option value="meta-llama/llama-3.3-70b-instruct:free">Meta: Llama 3.3 70B Instruct</option>
                  <option value="deepseek/deepseek-r1-distill-llama-70b:free">DeepSeek: R1 Distill Llama</option>
                  <option value="qwen/qwen2.5-vl-72b-instruct:free">Qwen: Qwen2.5 VL 72B Instruct (free)</option>
                </select>
                <div class="apikey-container">
                  <input type="password" id="apikey-input" placeholder="Paste your OpenRouter API key here to begin...">
                <button class="toggle-password" title="Show/Hide API key">
                    <i class="eye icon"></i>
                  </button>
                  <button id="apikey-button">save key</button>
                </div>
              </div>
              <div class="chat-container">
                <div class="chat-messages" id="chat-messages"></div>
                <div class="chat-input-container">
                  <div id="code-input" class="chat-editable" ></div>
                  <div class="chat-textarea-container">
                      <textarea id="chat-textarea" placeholder="Ask the professor anything..."></textarea>
                      <button id="send-message" class="ui primary button" >
                      <i class="paper plane icon"></i>
                      </button>
                  </div>
                </div>
              </div>
            `);

      setTimeout(() => {
        // Load saved API key if exists
        const savedApiKey = localStorage.getItem("OPENROUTER_API_KEY");
        if (savedApiKey) {
          $container.find("#apikey-input").val(savedApiKey);
        }

        // Handle API key save
        $container.find("#apikey-button").on("click", function () {
          const apiKey = $container.find("#apikey-input").val().trim();
          if (apiKey) {
            localStorage.setItem("OPENROUTER_API_KEY", apiKey);
            alert("API key saved successfully!");
          } else {
            alert("Please enter an API key");
          }
        });

        console.log("Checking if dropdown exists in component...");

        const $modelSelector = $container.find("#model-selector");
        if ($modelSelector.length) {
          console.log("✅ Dropdown found! Binding event listener...");

          $modelSelector.on("change", function (event) {
            let selectedModel = event.target.value;
            localStorage.setItem("selectedModel", selectedModel);
            console.log(`✅ Model changed to: ${selectedModel}`);
          });

          // ✅ Ensure dropdown reflects saved selection
          const savedModel = localStorage.getItem("selectedModel");
          if (savedModel) {
            $modelSelector.val(savedModel);
          }
        } else {
          console.warn("⚠️ Dropdown not found! This shouldn't happen.");
        }
      }, 100);
      initializeChat($container);
    });

    layout.on("initialised", function () {
      setDefaults();
      refreshLayoutSize();
      window.top.postMessage({ event: "initialised" }, "*");
    });

    layout.init();
  });

  let superKey = "⌘";
  if (!/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
    superKey = "Ctrl";
  }

  [$runBtn].forEach((btn) => {
    btn.attr("data-content", `${superKey}${btn.attr("data-content")}`);
  });

  document.querySelectorAll(".description").forEach((e) => {
    e.innerText = `${superKey}${e.innerText}`;
  });

  if (IS_PUTER) {
    puter.ui.onLaunchedWithItems(async function (items) {
      gPuterFile = items[0];
      openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
    });
  }

  document
    .getElementById("judge0-open-file-btn")
    .addEventListener("click", openAction);
  document
    .getElementById("judge0-save-btn")
    .addEventListener("click", saveAction);

  window.onmessage = function (e) {
    if (!e.data) {
      return;
    }

    if (e.data.action === "get") {
      window.top.postMessage(
        JSON.parse(
          JSON.stringify({
            event: "getResponse",
            source_code: sourceEditor.getValue(),
            language_id: getSelectedLanguageId(),
            flavor: getSelectedLanguageFlavor(),
            stdin: stdinEditor.getValue(),
            stdout: stdoutEditor.getValue(),
            compiler_options: $compilerOptions.val(),
            command_line_arguments: $commandLineArguments.val(),
          })
        ),
        "*"
      );
    } else if (e.data.action === "set") {
      if (e.data.source_code) {
        sourceEditor.setValue(e.data.source_code);
      }
      if (e.data.language_id && e.data.flavor) {
        selectLanguageByFlavorAndId(e.data.language_id, e.data.flavor);
      }
      if (e.data.stdin) {
        stdinEditor.setValue(e.data.stdin);
      }
      if (e.data.stdout) {
        stdoutEditor.setValue(e.data.stdout);
      }
      if (e.data.compiler_options) {
        $compilerOptions.val(e.data.compiler_options);
      }
      if (e.data.command_line_arguments) {
        $commandLineArguments.val(e.data.command_line_arguments);
      }
      if (e.data.api_key) {
        AUTH_HEADERS["Authorization"] = `Bearer ${e.data.api_key}`;
      }
    }
  };
});

const DEFAULT_SOURCE = `print("Hello World")`;

const DEFAULT_STDIN =
  "\
3\n\
3 2\n\
1 2 5\n\
2 3 7\n\
1 3\n\
3 3\n\
1 2 4\n\
1 3 7\n\
2 3 1\n\
1 3\n\
3 1\n\
1 2 4\n\
1 3\n\
";

const DEFAULT_COMPILER_OPTIONS = "";
const DEFAULT_CMD_ARGUMENTS = "";
const DEFAULT_LANGUAGE_ID = 100; // C++ (GCC 14.1.0) (https://ce.judge0.com/languages/105)

function getEditorLanguageMode(languageName) {
  const DEFAULT_EDITOR_LANGUAGE_MODE = "plaintext";
  const LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE = {
    Bash: "shell",
    C: "c",
    C3: "c",
    "C#": "csharp",
    "C++": "cpp",
    Clojure: "clojure",
    "F#": "fsharp",
    Go: "go",
    Java: "java",
    JavaScript: "javascript",
    Kotlin: "kotlin",
    "Objective-C": "objective-c",
    Pascal: "pascal",
    Perl: "perl",
    PHP: "php",
    Python: "python",
    R: "r",
    Ruby: "ruby",
    SQL: "sql",
    Swift: "swift",
    TypeScript: "typescript",
    "Visual Basic": "vb",
  };

  for (let key in LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE) {
    if (languageName.toLowerCase().startsWith(key.toLowerCase())) {
      return LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE[key];
    }
  }
  return DEFAULT_EDITOR_LANGUAGE_MODE;
}

const EXTENSIONS_TABLE = {
  asm: { flavor: CE, language_id: 45 }, // Assembly (NASM 2.14.02)
  c: { flavor: CE, language_id: 103 }, // C (GCC 14.1.0)
  cpp: { flavor: CE, language_id: 105 }, // C++ (GCC 14.1.0)
  cs: { flavor: EXTRA_CE, language_id: 29 }, // C# (.NET Core SDK 7.0.400)
  go: { flavor: CE, language_id: 95 }, // Go (1.18.5)
  java: { flavor: CE, language_id: 91 }, // Java (JDK 17.0.6)
  js: { flavor: CE, language_id: 102 }, // JavaScript (Node.js 22.08.0)
  lua: { flavor: CE, language_id: 64 }, // Lua (5.3.5)
  pas: { flavor: CE, language_id: 67 }, // Pascal (FPC 3.0.4)
  php: { flavor: CE, language_id: 98 }, // PHP (8.3.11)
  py: { flavor: EXTRA_CE, language_id: 25 }, // Python for ML (3.11.2)
  r: { flavor: CE, language_id: 99 }, // R (4.4.1)
  rb: { flavor: CE, language_id: 72 }, // Ruby (2.7.0)
  rs: { flavor: CE, language_id: 73 }, // Rust (1.40.0)
  scala: { flavor: CE, language_id: 81 }, // Scala (2.13.2)
  sh: { flavor: CE, language_id: 46 }, // Bash (5.0.0)
  swift: { flavor: CE, language_id: 83 }, // Swift (5.2.3)
  ts: { flavor: CE, language_id: 101 }, // TypeScript (5.6.2)
  txt: { flavor: CE, language_id: 43 }, // Plain Text
};

function getLanguageForExtension(extension) {
  return EXTENSIONS_TABLE[extension] || { flavor: CE, language_id: 43 }; // Plain Text (https://ce.judge0.com/languages/43)
}

function formatTimeStamp() {
  const now = new Date();
  return now.toLocaleTimeString("en-UK", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
}

function initializeChat($container) {
  const $sendButton = $container.find("#send-message");
  const $chatMessages = $container.find("#chat-messages");
  const $codeInput = $container.find("#code-input");
  const $chatTextarea = $container.find("#chat-textarea");
  const $togglePassword = $container.find(".toggle-password");
  const $apikeyInput = $container.find("#apikey-input");

  // Show/Hide password on click
  $togglePassword.on("click", function () {
    const type = $apikeyInput.attr("type") === "password" ? "text" : "password";
    $apikeyInput.attr("type", type);

    const icon = $(this).find("i");
    if (type === "password") {
      icon.removeClass("slash").addClass("eye");
    } else {
      icon.removeClass("eye").addClass("slash eye");
    }
  });

  // user is not allowed to send an empty message
  function updateSendButtonState() {
    const codeInputDiv = $codeInput?.html().trim();
    const chatTextareaVal = $chatTextarea?.val().trim();

    if (chatTextareaVal) {
      $sendButton.prop("disabled", false);
    } else if (codeInputDiv) {
      if (chatTextareaVal) {
        $sendButton.prop("disabled", false);
      }
    } else {
      $sendButton.prop("disabled", true);
    }
  }

  // Attach event listeners
  $chatTextarea.on("input", updateSendButtonState);
  $codeInput.on("DOMSubtreeModified", updateSendButtonState);
  // Ensure the send button is disabled initially
  updateSendButtonState();

  // when the user types in the chat textarea, the height of the textarea should be adjusted to fit the content
  $chatTextarea.on("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 200) + "px";
  });

  function sendMessage() {
    // remove the delete button before sending the message
    $codeInput.find("button:contains('✖ Remove Selected Code')").remove();

    console.log("sending message");

    const codeInputDiv = $codeInput?.html().trim();
    const chatTextareaVal = $chatTextarea?.val().trim();

    let message;
    if (codeInputDiv && chatTextareaVal) {
      // needs some formating to ensure that the user message is seperate
      message = "\n\n\n" + codeInputDiv + "\n\n\n" + chatTextareaVal;
    } else {
      message = chatTextareaVal;
    }

    addMessageToChat("user", message);

    console.log("message sent to chat", message);

    // reset config
    $codeInput.html("").hide();
    console.log("reset code input", $codeInput.html());
    $chatTextarea.val("");
    updateSendButtonState();

    // format context
    const codeContext = {
      source_code: sourceEditor.getValue(),
      language: $selectLanguage.find(":selected").text(),
      input: stdinEditor.getValue(),
      output: stdoutEditor.getValue(),
    };

    const thinkingMsg = createThinkingMessage();

    const currentModel = localStorage.getItem("selectedModel");

    const prompt = `
    Use my current code as context only if I have questions related to the code context. Don't mention that you have access to the code context in your response.
    You have access to the following code context:
    \n\n ${codeContext.language ? "Language: " + codeContext.language : ""}
    \n\n ${
      codeContext.source_code ? "Source Code: " + codeContext.source_code : ""
    }
    \n\n ${codeContext.input ? "Input:\n" + codeContext.input : ""}
    \n\n ${codeContext.output ? "Output:\n" + codeContext.output : ""}
    \n\n Here is the user message: \n\n ${message}`;

    callOpenRouterAPI(prompt, currentModel, "chat")
      .then((response) => {
        thinkingMsg.remove();
        addMessageToChat("assistant", response);
      })
      .catch((error) => handleAPIError(thinkingMsg, error));
  }

  // Event listeners
  $sendButton.on("click", sendMessage);
  $chatTextarea.on("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent new line
      if ($chatTextarea.val().trim() !== "") {
        sendMessage();
        updateSendButtonState();
      }
    }
  });
}

// Add these utility functions at the top level
function createChatMessage(role, content) {
  const $chatMessages = $("#chat-messages");
  const $message = $(`
    <div class="chat-message ${role}-message">
      <div class="message-content">
        ${content}
        <div class="message-timeStamp">${formatTimeStamp()}</div>
      </div>
    </div>`);
  // adding messages to the chat messages div container
  $chatMessages.append($message);
  return $message;
}

function scrollChatToBottom($chatMessages) {
  if ($chatMessages.length && $chatMessages[0]) {
    $chatMessages.scrollTop($chatMessages[0].scrollHeight);
  }
}

function handleError(error, type = "api") {
  console.error(`${type} error:`, error);
  if (type === "run") {
    showHttpError(error);
    $runBtn.removeClass("disabled");
  }
}

function addMessageToChat(role, content) {
  const cleanedContent = cleanResponse(content);
  const $chatMessages = $("#chat-messages");

  const $message = createChatMessage(role, cleanedContent);

  // Apply syntax highlighting to code blocks
  $message.find("pre code").each(function () {
    hljs.highlightBlock(this);
  });

  scrollChatToBottom($chatMessages);
}

function checkForErrorAndOffer(output) {
  if (detectError(output)) {
    const $chatMessages = $("#chat-messages").empty();
    const $sendButton = $("#send-message");
    const $chatTextarea = $("#chat-textarea");
    // hide text area and botton
    $chatTextarea.hide();
    $sendButton.hide();

    const $errorMessage = createChatMessage(
      "error-help-message",
      `
      Would you like some help with this error?
      <div class="error-help-buttons">
        <button class="error-help-yes">Yes</button>
        <button class="error-help-no">No</button>
      </div>
    `
    );

    $chatMessages.append($errorMessage);
    scrollChatToBottom($chatMessages);

    attachErrorHelpHandlers($errorMessage, output);
  }
}

function attachErrorHelpHandlers($message, output) {
  $message.find(".error-help-yes").on("click", function () {
    handleErrorHelp($(this).closest(".chat-message"), output);
  });

  $message.find(".error-help-no").on("click", function () {
    $(this).closest(".chat-message").remove();
    $("#chat-textarea").show();
    $("#send-message").show();
  });
}

function handleErrorHelp($message, error) {
  $message.remove();
  const thinkingMsg = createThinkingMessage();
  const $sendButton = $("#send-message");
  const $chatTextarea = $("#chat-textarea");
  $("#chat-messages").append(thinkingMsg);

  const userPrompt = `Language: ${$selectLanguage
    .find(":selected")
    .text()}\n\nCode:\n${sourceEditor.getValue()}\n\nError:\n${error}`;

  const currentModel = localStorage.getItem("selectedModel");

  callOpenRouterAPI(userPrompt, currentModel, "errorHelp")
    .then((response) => {
      thinkingMsg.remove();
      handleErrorHelpResponse(response, error);
    })
    .catch((error) => handleAPIError(thinkingMsg, error, handleError(error)))
    .finally(() => {
      // show text area and button
      $chatTextarea.show();
      $sendButton.show();
    });
}

function cleanResponse(content) {
  //trim leading and trailing whitespace

  //preserve indentation in code blocks
  content = content.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (match, p1) => {
      // Remove extra spaces and newlines outside code blocks
      return `<pre><code>${p1.trim()}</code></pre>`;
    }
  );

  //remove extra spaces and newlines between HTML tags
  content = content.replace(/>\s+</g, "><");

  return content;
}

function createThinkingMessage() {
  const $chatMessages = $("#chat-messages");
  const thinkingMsg = $(`
          <div class="chat-message assistant-message">
              <span class="fa fa-robot"></span>
              <div class="thinking">Thinking</div>
          </div>
      `);
  $chatMessages.append(thinkingMsg);
  $chatMessages.scrollTop($chatMessages[0].scrollHeight);
  return thinkingMsg;
}

function addSelectedTextToChat(selectedText) {
  const $codeInput = $("#code-input");
  const $chatTextarea = $("#chat-textarea");
  $codeInput.show().empty(); //show & clear previous content

  //create elements
  const preElement = document.createElement("pre");
  const codeElement = document.createElement("code");
  const removeButton = document.createElement("button");

  //set up selected text
  codeElement.textContent = selectedText;
  preElement.appendChild(codeElement);

  //set up remove button
  removeButton.textContent = "✖ Remove Selected Code";
  removeButton.classList.add("remove-btn");
  removeButton.style.marginLeft = "10px";
  removeButton.style.cursor = "pointer";
  removeButton.style.color = "grey";
  removeButton.style.background = "transparent";
  removeButton.style.border = "none";
  removeButton.style.fontSize = "14px";

  //remove selected text when clicked
  removeButton.onclick = function () {
    $codeInput.empty().hide();
  };

  $codeInput.append(removeButton);
  $codeInput.append(preElement);

  //apply syntax highlighting
  hljs.highlightElement(codeElement);
  $chatTextarea.focus();
}

// whats the best model to use for auto complete?
function handleAutoComplete(text, lineContent, cursorPosition) {
  // console.log("handleAutoComplete", text, lineContent, cursorPosition);
  const currentModel = "google/gemini-2.0-flash-thinking-exp:free";
  const userPrompt = `
  Complete the following line of code: \n\n\n ${lineContent} \n\n\n The user has already typed:\n\n\n ${text}.\n\n\n 
  and the cursor is at the end of the line is positioned at: \n\n\n ${cursorPosition}.
  `;
  // callOpenRouterAPI(userPrompt, currentModel, "autoComplete")
  //   .then((response) => {
  //     console.log("auto complete response", response);
  //   })
  //   .catch((error) => console.error("auto complete error", error));
}

function handleErrorHelpResponse(response, error) {
  // there are different error patterns so we need to account for most cases
  const errorLineMatcher = error.match(/line (\d+)/);
  const errorLine = errorLineMatcher ? parseInt(errorLineMatcher[1]) : null;

  // highlight the error line DOES NOT WORK
  if (errorLine) {
    sourceEditor.deltaDecorations(
      [],
      [
        {
          range: new monaco.Range(errorLine, 1, errorLine, 1),
          options: {
            isWholeLine: true,
            className: "errorHighlight",
          },
        },
      ]
    );
  }

  const diffMatch = response.match(
    /DIFF:\s*\n([\s\S]*?)(?=\n\s*EXPLANATION:|$)/i
  );
  const explanationMatch = response.match(/EXPLANATION:\s*([\s\S]*)/i);

  console.log("explanationMatch", explanationMatch);
  console.log("diffMatch", diffMatch);

  if (diffMatch) {
    const rawDiff = diffMatch[1];
    const changes = parseDiff(rawDiff);

    const diffContainer = document.createElement("div");
    diffContainer.className = "chat-message assistant-message";
    diffContainer.innerHTML = `
      <div class="message-content">
        <div class="diff-header">
          <h3>Suggested Fix</h3>
          <div class="diff-actions">
            <button class="accept-diff">Accept</button>
            <button class="reject-diff">Reject</button>
          </div>
        </div>
        <pre class="diff-content">${formatDiff(rawDiff)}</pre>
        ${
          explanationMatch
            ? `<p class="diff-explanation">${explanationMatch[1]}</p>`
            : ""
        }
        <div class="message-timeStamp">${formatTimeStamp()}</div>
      </div>
    `;

    // Remove any existing diff suggestions first
    const $chatMessages = $("#chat-messages");
    $chatMessages.find(".diff-suggestion").remove();

    // Append to chat messages
    $chatMessages.append(diffContainer);

    scrollChatToBottom($chatMessages);

    // Add event listeners
    diffContainer
      .querySelector(".accept-diff")
      .addEventListener("click", () => {
        applyChanges(changes, errorLine);
        diffContainer.remove();
      });

    diffContainer
      .querySelector(".reject-diff")
      .addEventListener("click", () => {
        diffContainer.remove();
      });
  }
}

function parseDiff(rawDiff) {
  const changes = [];
  let currentChange = { removals: [], additions: [] };

  rawDiff.split("\n").forEach((line) => {
    if (line.startsWith("-")) {
      if (currentChange.additions.length > 0) {
        changes.push(currentChange);
        currentChange = { removals: [], additions: [] };
      }
      currentChange.removals.push(line.substring(1)); // Remove trimEnd()
    } else if (line.startsWith("+")) {
      currentChange.additions.push(line.substring(1));
    } else {
      if (
        currentChange.removals.length > 0 ||
        currentChange.additions.length > 0
      ) {
        changes.push(currentChange);
        currentChange = { removals: [], additions: [] };
      }
    }
  });

  if (currentChange.removals.length > 0 || currentChange.additions.length > 0) {
    changes.push(currentChange);
  }
  console.log("grouped changes", changes);

  return changes;
}

function formatDiff(rawDiff) {
  return rawDiff
    .split("\n")
    .map((line) => {
      if (line.startsWith("-")) {
        return `<span class="remove">${line}</span>`;
      } else if (line.startsWith("+")) {
        return `<span class="apply">${line}</span>`;
      }
      return line;
    })
    .join("\n");
}

function applyChanges(changes, errorLine) {
  let currentCode = sourceEditor.getValue().split("\n");

  changes.forEach((change) => {
    let targetLine = -1;

    // 1. Try to find matching line with whitespace sensitivity
    if (change.removals.length > 0) {
      // Compare with trimmed lines but preserve original whitespace
      const lineToFind = change.removals[0];
      targetLine = currentCode.findIndex(
        (codeLine) => codeLine.trim() === lineToFind.trim()
      );
    }

    // 2. Error line fallback
    if (targetLine === -1 && errorLine !== null) {
      targetLine = errorLine - 1;
      console.log(`Using error line fallback: ${errorLine} → ${targetLine}`);
    }

    // If we still can't find the line -> try to find context
    if (targetLine === -1) {
      const contextLines = currentCode.filter(
        (lines) => !lines.startsWith("+") && !lines.startsWith("-")
      );
      for (const contextLine of contextLines) {
        targetLine = currentCode.findIndex(
          (codeLine) => codeLine.trim() === contextLine.trim()
        );
        if (targetLine !== -1) {
          break;
        }
      }
    }

    // if we found a place to make the changes
    if (targetLine !== -1) {
      if (change.removals.length > 0) {
        console.log("Applying changes at line: ", targetLine);
        console.log("Removing Lines: ", change.removals);
        console.log("Adding lines ", change.additions);

        if (change.removals.length > 0) {
          currentCode.splice(targetLine, change.removals.length);
        }
        if (change.additions.length > 0) {
          currentCode.splice(
            targetLine,
            0,
            ...change.additions.map((line) => line.replace(/^ /, "")) // only remove the first space
          );
        }
      }
    } else {
      console.log("could not find target line for change");
    }
  });

  sourceEditor.setValue(currentCode.join("\n"));
}
