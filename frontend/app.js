const MODELS_API_URL = '/v1/models';
const LOAD_API_URL = '/load';
const UNLOAD_API_URL = '/unload';
const STOP_API_URL = '/stop';
const STATUS_API_URL = '/status';
const REQUEST_API_URL = '/request';
const STREAM_API_URL = '/stream';
const GET_DATA_URL = '/get';
const SET_DATA_URL = '/set';

const btnToggleArchiveWindow = document.getElementsByClassName("archive-window-btn")[0];
const btnSaveCurrentChat = document.getElementById("save-current-chat-btn");
const btnShowSystemWindow = document.getElementsByClassName("show-sys-window-btn")[0];
const btnShowMessageWindow = document.getElementsByClassName("show-msg-window-btn")[0];
const btnModel = document.getElementsByClassName("model-btn")[0];
const btnLoadModel = document.getElementsByClassName("load-model-btn")[0];
const btnUnloadModel = document.getElementsByClassName("unload-model-btn")[0];
const btnStopModel = document.getElementsByClassName("stop-model-btn")[0];
const btnClearChat = document.getElementsByClassName("clear-chat-btn")[0];
const btnNewSysMsg = document.getElementById("sys-msg-new-btn");
const btnLoadSysMsg = document.getElementById("sys-msg-load-btn");
const btnSaveSysMsg = document.getElementById("sys-msg-save-btn");
const btnDeleteSysMsg = document.getElementById("sys-msg-delete-btn");
const drdSysMsg = document.getElementsByClassName("sys-msg-dropdown")[0];

const btnSendUserMsg = document.getElementById("usr-msg-send-btn");
const btnClearUserMsg = document.getElementById("usr-msg-clear-btn");
const btnConfigUserMsg = document.getElementById("usr-msg-config-btn");

const drdSelectModel = document.getElementById("selected-model-dropdown");
const cbEnableThink = document.getElementById("usr-msg-enable-think-cb");

const crModelIndicator = document.getElementsByClassName("model-circle-indicator")[0];

const txtSysMsg = document.getElementById("sys-msg-input");
const txtUsrMsg = document.getElementById("usr-msg-input");

const pnMsgDisplay = document.getElementsByClassName("message-display")[0];

const paramFieldIdMap = {
  max_tokens: "usr-msg-max-tokens-textarea",
  temperature: "usr-msg-temperature-textarea",
  top_k: "usr-msg-top-k-textarea",
  top_p: "usr-msg-top-p-textarea",
  min_p: "usr-msg-min-p-textarea",
  repetition_penalty: "usr-msg-rep-pen-textarea",
  repetition_penalty_range: "usr-msg-rep-range-textarea",
  frequency_penalty: "usr-msg-freq-pen-textarea",
  frequency_penalty_range: "usr-msg-freq-range-textarea",
  presence_penalty: "usr-msg-pres-pen-textarea",
  presence_penalty_range: "usr-msg-pres-range-textarea"
};

const allMessages = [];

var currentChatTitle = null;

var targetModel = {
  provider: null,
  name: null,
};

var modelInfo = {
  name: null,
  provider: null,
  config: null
};

var msgConfig = {
  max_tokens: null,
  temperature: null,
  top_k: null,
  top_p: null,
  min_p: null,
  repetition_penalty: null,
  repetition_penalty_range: null,
  frequency_penalty: null,
  frequency_penalty_range: null,
  presence_penalty: null,
  presence_penalty_range: null
};

var systemMessages = null;
var currSystemMsg = {
  id: 0,
  name: "Default",
  content: "You are an AI assistant."
};

var modelList = null;

var bAllowAllModels = true;

allMessages.push({
  role: "system", 
  content: currSystemMsg.content
});

initializeUI();

/*
 * SECTION: General Functions
 */
function initializeEventHandlers() {
  btnClearChat.onclick = clearChat;

  /* Model Selection Handlers */
  btnModel.onclick = toggleSelectModelPanel;
  btnLoadModel.onclick = handleLoadModel;
  btnUnloadModel.onclick = handleUnloadModel;
  btnStopModel.onclick = handleStopModel;
  drdSelectModel.onchange = handleModelSelect;

  /* User Message Handlers */
  btnShowMessageWindow.onclick = toggleMessageWindow;
  btnConfigUserMsg.onclick = toggleConfigPanel;
  btnSendUserMsg.onclick = handleSend;
  btnClearUserMsg.onclick = clearUserMessage;

  /* Message Archive Handlers */
  btnToggleArchiveWindow.onclick = toggleArchiveWindow;
  btnSaveCurrentChat.onclick = saveCurrentChat;

  txtUsrMsg.onkeydown = function(e) {
    if ((e.keyCode == 13) && (e.metaKey)) {
      handleSend(e);
      e.preventDefault();
    }
  };

  /* System Message Handlers */
  btnShowSystemWindow.onclick = toggleSystemWindow; 
  btnNewSysMsg.onclick = toggleSaveSysMsgPanel;
  btnSaveSysMsg.onclick = addSystemMessage;
  btnDeleteSysMsg.onclick = deleteSystemMessage;
  btnLoadSysMsg.onclick = setCurrentSystemMessage;

  drdSysMsg.onchange = handleSystemMessageSelect;

  txtSysMsg.onkeydown = function(e) {
    if ((e.keyCode == 13) && (e.metaKey)) {
      console.log("System Message set.");
      setCurrentSystemMessage();
    }
  };
};

async function initializeUI() {
  await getSystemMessages();
  await getServerStatus();
  await initializeModelList();

  initializeEventHandlers();
};

async function getServerStatus() {
  try {
    const response = await fetch(STATUS_API_URL,{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const rstyle = window.getComputedStyle(document.body);
    if (response.ok) {
      const result = await response.json();
      if (result.hasOwnProperty('model_name')) {
        modelInfo = {
          name: result.model_name,
          provider: result.model_provider,
          config: result.model_config
        }

        setMessageConfig(modelInfo.config.model);
        updateMessageConfigUI();
        console.log(modelInfo);

        targetModel.name = modelInfo.name;
        targetModel.provider = modelInfo.provider;

        updateSelectModelDropdownSelection(targetModel);

        btnLoadModel.disabled = true;
        btnLoadModel.style.display = "none";
        btnUnloadModel.disabled = false;
        btnUnloadModel.style.display = null;

        drdSelectModel.disabled = true;
        crModelIndicator.style.backgroundColor = rstyle.getPropertyValue("--model-indicator-on-color");

      } else {
        btnLoadModel.disabled = false;
        btnLoadModel.style.display = null;
        btnUnloadModel.disabled = true;
        btnUnloadModel.style.display = "none";

        drdSelectModel.disabled = false;
        crModelIndicator.style.backgroundColor = rstyle.getPropertyValue("--model-indicator-off-color");
      }
      return result;
    } else {
      const error = await response.text;
      console.log("Request Failed:", error);
    }
  } catch(error) {
    console.log("Network or Fetch Error:", error);
  }
};

async function retrieveData(key) {
  const payload = {
    k: key,
    v: null
  };
  try {
    const response = await fetch(GET_DATA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      return result.v;

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);
    }
      
  } catch (error) {
    console.error('Network or Fetch error:', error);
  }
  return null;
};

async function storeData(key, value) {
  const payload = {
    k: key,
    v: value
  };
  try {
    const response = await fetch(SET_DATA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      return;

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);
    }
      
  } catch (error) {
    console.error('Network or Fetch error:', error);
  }
  return;
};

function clearChat() {
  const userConfirmed = confirm("Are you sure you want to clear the current chat?");
  if (userConfirmed !== true) {
    return;
  }
  allMessages.length = 1;
  updateMessageDisplay();
};

/*
 * SECTION: Model Selection Functions
 */
async function getModelList() {
  try {
    const response = await fetch(MODELS_API_URL,{
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (response.ok) {
      const result = await response.json();
      modelList = result.filter((m) => {
        if (bAllowAllModels) {
          return true;
        }
        if (m.name.includes("gemma") || m.name.includes("ministral") || m.name.includes("qwen")) {
          return true;
        }
        return false;
      });
      return result;

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);
    }
  } catch(error) {
    console.log("Network or Fetch Error:", error);
  }
};

async function initializeModelList() {
  await getModelList();

  updateSelectModelDropdownContent();
};

async function toggleSelectModelPanel(e, to_state=null) {
  if (modelList == null) {
    await initializeModelList();
  }

  if (to_state != null) {
    pnSelectModel.style.display = to_state;
    return;
  }

  const pnSelectModel = document.getElementsByClassName("model-selector-panel")[0];
  if (pnSelectModel.style.display == "flex") {
    pnSelectModel.style.display = "none";
  } else {
    pnSelectModel.style.display = "flex";
  }
};


function updateSelectModelDropdownSelection(targetModel) {
  drdSelectModel.value = targetModel.provider + "/" + targetModel.name;
};

function updateSelectModelDropdownContent() {
  drdSelectModel.innerHTML = "";

  for (m of modelList) {
    const opt = document.createElement("option");
    opt.value = m.provider + "/" + m.name;
    opt.textContent = m.name;

    drdSelectModel.append(opt);
  }
  updateSelectModelDropdownSelection(targetModel);
};

async function handleLoadModel(event) {
  event.preventDefault();

  const payload = {
    provider: targetModel.provider,
    name: targetModel.name
  };
  btnLoadModel.disabled = true;
  try {
    const response = await fetch(LOAD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      serverStatus = await getServerStatus();

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);
      btnLoadModel.disabled = false;
    }
      
  } catch (error) {
    console.error('Network or Fetch error:', error);
      btnLoadModel.disabled = false;
  }
};

async function handleUnloadModel(event) {
  event.preventDefault();

  const btnUnloadModel = document.getElementsByClassName("unload-model-btn")[0];
  const payload = {
    provider: targetModel.provider,
    name: targetModel.name
  };
  try {
    const response = await fetch(UNLOAD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      serverStatus = await getServerStatus();

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);

    }
      
  } catch (error) {
    console.error('Network or Fetch error:', error);
  }
};

async function handleStopModel(event) {
  event.preventDefault();

  const payload = {
    provider: targetModel.provider,
    name: targetModel.name
  };
  try {
    const response = await fetch(STOP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      serverStatus = await getServerStatus();

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);

    }
      
  } catch (error) {
    console.error('Network or Fetch error:', error);
  }
};

function handleModelSelect(e) {
  const selected = e.target.value.split("/");
  targetModel.provider = selected[0];
  targetModel.name = selected[1];
  return;
};

/*
 * SECTION: User Message Functions
 */
function toggleMessageWindow(e, to_state=null) {
  const pnUserMsg = document.getElementsByClassName("usr-msg-window")[0];
  if (to_state != null) {
    pnUserMsg.style.display = to_state;
    return;
  }

  if (pnUserMsg.style.display == "flex") {
    pnUserMsg.style.display = "none";
  } else {
    pnUserMsg.style.display = "flex";
  }
};

function updateMessageDisplay() {
  pnMsgDisplay.innerHTML = "";
  allMessages.forEach(addMessageToDisplay);
};

function updateChatTitle(title) {
  currentChatTitle = title;

  const pnChatTitle = document.getElementsByClassName("message-title-panel")[0];
  pnChatTitle.textContent = currentChatTitle;
};

function clearUserMessage() {
  event.preventDefault();
  txtUsrMsg.value = '';
};

function addMessageToDisplay(msgData) {
  if (msgData.role == "system") {
    return;
  }

  const msgDiv = document.createElement("div");
  let msgType = msgData.role;

  // Apply the needed classes
  msgDiv.classList.add('message', msgType);

  var converter = new showdown.Converter({
    backslashEscapesHTMLTags: true,
    simpleLineBreaks: true,
    tables: true,
  });
  const wrap = document.createElement("p");
  wrap.classList.add('message-content');
  wrap.id = "message-content-" + (msgData.id).toString();

  const isAssistant = (msgType == "assistant");
  const isUser = (msgType == "user");
  const isPartial = (msgData.hasOwnProperty('partial'));

  if (isAssistant) {
    let content = msgData.content;
    content = content.replace("<channel|>","<br/><br/>");
    content = content.replace("<|channel>thought","");

    wrap.innerHTML = converter.makeHtml(content);
  } else if (isUser) {
    const content = msgData.content.replace(/\n/g, "<br/>");
    wrap.innerHTML = content;
  } else {
    wrap.textContent += msgData.content;
  }
  msgDiv.appendChild(wrap);

  if (isAssistant && !isPartial) {
    const editBtn = document.createElement("button");
    editBtn.classList.add("message-edit-btn");
    editBtn.textContent = "edit";
    editBtn.value = msgData.id;

    editBtn.onclick = (e) => {
      let content = e.target.parentNode.getElementsByClassName("message-content")[0];

      // If no text area yet, then we must be in static state
      if (content.getElementsByTagName("textarea").length <= 0) {
        e.target.textContent = "save";
        e.target.parentNode.style.width = '100%';

        let content = e.target.parentNode.getElementsByClassName("message-content")[0];
        content.innerHTML = "";

        let txtEditableContent = document.createElement("textarea");
        txtEditableContent.value = msgData.content;

        content.appendChild(txtEditableContent);

      // Otherwise, all we have to do is save the edits
      } else {
        const txtEditedContent = content.getElementsByTagName("textarea")[0];
        const editedContent = txtEditedContent.value;
        const editedMsgId = e.target.value;

        for (const m of allMessages) {
          if (m.id == editedMsgId) {
            if (m.content != editedContent) {
              m.content = editedContent;
              m.edited = true;
            }
            break;
          }
        }

        updateMessageDisplay();

        e.target.parentNode.style.width = null;
        e.target.textContent = "edit";
      }

    };
    msgDiv.appendChild(editBtn);
  }

  const copyContentBtn = document.createElement("button");
  copyContentBtn.classList.add("message-copy-btn");
  copyContentBtn.textContent = "copy";

  copyContentBtn.onclick = () => {
    navigator.clipboard.writeText(msgData.content);
  };

  msgDiv.appendChild(copyContentBtn);


  if (msgData.hasOwnProperty("extras")) {
    const expandExtrasBtn = document.createElement("button");
    expandExtrasBtn.classList.add("message-extras-btn");
    expandExtrasBtn.textContent = "show meta";

    expandExtrasBtn.onclick = () => {
      const pnMeta = expandExtrasBtn.parentNode.getElementsByClassName("message-metadata")[0];
      if (pnMeta.style.display == "none") {
        pnMeta.style.display = "block";
      } else {
        pnMeta.style.display = "none";
      }
    };

    msgDiv.appendChild(expandExtrasBtn);
  }

  if (msgData.hasOwnProperty("reasoning")) {
    const expandReasonBtn = document.createElement("button");
    expandReasonBtn.classList.add("message-reason-btn");
    expandReasonBtn.textContent = "show reason";

    expandReasonBtn.onclick = () => {
      const pnReason = expandReasonBtn.parentNode.getElementsByClassName("message-reasoning")[0];
      if (pnReason.style.display == "none") {
        pnReason.style.display = "block";
      } else {
        pnReason.style.display = "none";
      }
    };

    msgDiv.appendChild(expandReasonBtn);
  }

  if ((msgData.id >= 2) && (msgData.id == (allMessages.length-1)) && (isAssistant && !isPartial)) {
    const deleteMessageBtn = document.createElement("button");
    deleteMessageBtn.classList.add("message-delete-btn");
    deleteMessageBtn.textContent = "delete";

    deleteMessageBtn.onclick = () => {
      const userConfirmed = confirm("Are you sure you want to delete this message?");
      if (userConfirmed !== true) {
        return;
      }

      const currMsgId = msgData.id;

      if (allMessages[currMsgId-1].role != 'user') {
        console.log("ERROR: Possible unsafe delete");
        console.log(allMessages[currMsgId]);
        console.log(allMessages[currMsgId-1]);
        return;
      }

      /* Dump content of the last USER message to the message window */
      txtUsrMsg.value = allMessages[currMsgId-1].content;
      toggleMessageWindow(null, 'flex');

      /* Then remove the last two elements */
      allMessages.pop();
      allMessages.pop();

      updateMessageDisplay();
    };

    msgDiv.appendChild(deleteMessageBtn);
  }

  if (msgData.hasOwnProperty("extras")) {
    const extrasDiv = document.createElement("div");
    extrasDiv.classList.add("message-metadata");

    const wrap = document.createElement("p")
    wrap.textContent += "INP: " + msgData.extras.tokens.inp + " tok"
    wrap.textContent += " (" + msgData.extras.tps.inp + " tps /"
    wrap.textContent += msgData.extras.time.time_to_first_response + " secs) | " 
    wrap.textContent += "OUT: " + msgData.extras.tokens.out + " tok"
    wrap.textContent += " (" + msgData.extras.tps.out + " tps /"
    wrap.textContent += msgData.extras.time.response_generation + " secs) | "
    wrap.textContent += "MEM: " + msgData.extras.memory + " GB"

    extrasDiv.style.display = "none";

    const hr = document.createElement("hr");
    extrasDiv.appendChild(hr);
    if (msgData.edited) {
      const editIndicator = document.createElement("p")
      editIndicator.textContent = "(EDITED - Metadata no longer accurate!)";
      extrasDiv.appendChild(editIndicator);
    }
    extrasDiv.appendChild(wrap);
    msgDiv.appendChild(extrasDiv);
  }

  if (msgData.hasOwnProperty("reasoning")) {
    const reasonDiv = document.createElement("div");
    reasonDiv.classList.add("message-reasoning");
    const wrap = document.createElement("p")
    wrap.innerHTML = converter.makeHtml(msgData.reasoning);

    reasonDiv.style.display = "none";

    const hr = document.createElement("hr");
    reasonDiv.appendChild(hr);
    reasonDiv.appendChild(wrap);

    msgDiv.appendChild(reasonDiv);
  }

  pnMsgDisplay.appendChild(msgDiv);

  pnMsgDisplay.scrollTop = pnMsgDisplay.scrollHeight;
};

async function handleSend(event) {
  event.preventDefault();
  
  const latestMessage = txtUsrMsg.value.trim();
  allMessages.push({
    id: allMessages.length,
    role: 'user',
    content: latestMessage
  })
  const payloadMessages = filterPayloadMessages(allMessages);
  const payload = buildRequestPayload(payloadMessages);

  updateMessageDisplay();
  toggleMessageWindow();

  const rstyle = window.getComputedStyle(document.body);
  txtUsrMsg.disabled = true;
  txtUsrMsg.style.backgroundColor = rstyle.getPropertyValue("--textarea-disabled-color");
  txtUsrMsg.style.color = rstyle.getPropertyValue("--textarea-disabled-text-color");

  try {
    const response = await fetch(STREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      allMessages.push({
        id: allMessages.length,
        role: 'assistant',
        content: "",
        partial: true,
      });

      const latestMessageId = allMessages[allMessages.length-1].id;
      const latestContentDivId = "message-content-"+latestMessageId.toString();

      let buffer = "";
      let result = null;
      let chunkCount = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true}).trim();
        const bufferItems = buffer.split("\n");
        let chunkItems = [];
        try {
          for (const buf of bufferItems) {
            const chunkData = JSON.parse(buf.trim());
            chunkItems.push(chunkData);
          }
        } catch(error) {
          // If the buffer wasn't complete, then we try to load in the next bit
          const isSyntaxError = (error.name == "SyntaxError");
          const isUnterminated = (error.message.includes("unterminated string"));
          if (isSyntaxError && isUnterminated) {
            console.log("Buffer incomplete. Continuing...");
            continue
          }
          console.log(error);
          console.log(buf);
          throw error;
        }

        buffer = "";

        for (const chunkData of chunkItems) {
          if (chunkData.type == "chunk") {
            allMessages[latestMessageId].content += chunkData.data;

            if (chunkCount == 0) {
              updateMessageDisplay();

            } else {
              const latestContent = document.getElementById(latestContentDivId);
              latestContent.innerHTML += chunkData.data;

              if (((chunkCount+1) % 8) == 0) {
                var converter = new showdown.Converter({
                  backslashEscapesHTMLTags: true,
                  simpleLineBreaks: true,
                  tables: true,
                });

                let content = allMessages[latestMessageId].content;
                content = content.replace("<channel|>","<br/><br/>");
                content = content.replace("<|channel>thought","");

                latestContent.innerHTML = converter.makeHtml(content);
              }
            }

            chunkCount += 1;
            
          } else if (chunkData.type == "final") {
            result = JSON.parse(chunkData.data);

          } else {
              console.log("Received unknown chunk type");
              console.log(chunkData);
          }
        }
      }
      allMessages.pop();

      console.log(result);
      const received = result.choices[0].message.content;
      let newMessage = {
        id: allMessages.length,
        role: "assistant",
        content: received,
        extras: {
          tokens: {
            inp: result.usage.prompt_tokens,
            out: result.usage.completion_tokens,
            total: result.usage.total_tokens
          },
          tps: {
            inp: result.extras.prompt_tps,
            out: result.extras.completion_tps
          },
          time: result.extras.time,
          memory: result.extras.memory_usage.peak,
          edited: false
        }
      };
      
      if (result.choices[0].message.hasOwnProperty("reasoning")) {
        newMessage.reasoning = result.choices[0].message.reasoning.replace("thought","").trim();
      }

      allMessages.push(newMessage);

      const asstMessages = allMessages.filter((m) => m.role == 'assistant');
      if (asstMessages.length <= 1) {
        // Then we send out a chat title request
        requestChatTitle();
      }

      updateMessageDisplay();

      txtUsrMsg.value = '';

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);
    }
    txtUsrMsg.disabled = false;
    txtUsrMsg.style.backgroundColor = rstyle.getPropertyValue("--textarea-color"); 
    txtUsrMsg.style.color = rstyle.getPropertyValue("--textarea-text-color");
  } catch(error) {
    console.error('Network or Fetch error:', error);
    txtUsrMsg.disabled = false;
    txtUsrMsg.style.backgroundColor = rstyle.getPropertyValue("--textarea-color");
    txtUsrMsg.style.color = rstyle.getPropertyValue("--textarea-text-color");
  }
};

async function requestChatTitle() {
  const titleReqMsg = "Create a short title for this chat. " +
                      "It should be concise and straight-to-the-point. " +
                      "Output ONLY 1 title and nothing else.";
  const copiedMessages = Array.from(allMessages);
  copiedMessages.push({
    id: copiedMessages.length,
    role: 'user',
    content: titleReqMsg,
  });
  const payloadMessages = filterPayloadMessages(copiedMessages);
  let payload = buildRequestPayload(payloadMessages);
  payload.max_tokens = 30;
  payload.enable_thinking = false;

  try {
    const response = await fetch(REQUEST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.text();
      const parsed = JSON.parse(JSON.parse(result));
      const received = parsed.choices[0].message.content;
      updateChatTitle(received.trim());

    } else {
      const error = await response.text;
      console.log("Request Failed:", error);
    }

  } catch (error) {
    console.error('Network or Fetch error:', error);
  }
};

function filterPayloadMessages(messages) {
  const filteredMessages = [];
  for (const m of messages) { 
    if ((m.role == 'user') || (m.role == 'system') || (m.role == 'assistant')) {
      filteredMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  return filteredMessages;
}

function getSamplerConfig() {
  const samplerFields = { 
    temperature: "float", 
    top_k: "integer",
    top_p: "float", 
    min_p: "float"
  };
  let samplerConfig = {};
  for (const [param, param_type] of Object.entries(samplerFields)) {
    if (msgConfig[param] != null) {
      if (param_type == "integer") {
        samplerConfig[param] = parseInt(msgConfig[param]);
      } else {
        samplerConfig[param] = parseFloat(msgConfig[param]);
      }
    }
  }
  return samplerConfig;
}

function getLogitPreprocConfig() {
  const logitPreprocFields = [
    "repetition_penalty", "repetition_penalty_range",
    "frequency_penalty", "frequency_penalty_range",
    "presence_penalty", "presence_penalty_range",
  ]
  let logitPreprocConfig = {};
  for (const param of logitPreprocFields) {
    if (msgConfig[param] != null) {
      logitPreprocConfig[param] = Number(msgConfig[param]);
    }
  }
  return logitPreprocConfig;
}

function buildRequestPayload(messages) {
  getMessageConfigUIData();
  const samplerConfig = getSamplerConfig();
  const logitPreprocConfig = getLogitPreprocConfig();

  return {
    messages: messages,
    max_tokens: msgConfig.max_tokens,
    enable_thinking: cbEnableThink.checked,
    sampler: samplerConfig,
    logit_processors: logitPreprocConfig,
  };
}



/*
 * SECTION: Message Configuration Functions
 */
function toggleConfigPanel(e, to_state=null) {
  const pnConfig = document.getElementsByClassName("side-window-config-panel")[0];
  if (to_state != null) {
    pnConfig.style.display = to_state;
    return;
  }

  if (pnConfig.style.display == "flex") {
    pnConfig.style.display = "none";
  } else {
    pnConfig.style.display = "flex";
  }

  e.preventDefault();
};

function updateMessageConfigUI() {
  for (let [param, param_val] of Object.entries(msgConfig)) {
    const txtParam = document.getElementById(paramFieldIdMap[param]);
    if (txtParam == null) {
      continue;
    }
    txtParam.value = param_val;
  }
};

function getMessageConfigUIData() {
  for (let [param, param_val] of Object.entries(msgConfig)) {
    const txtParam = document.getElementById(paramFieldIdMap[param]);
    if (txtParam == null) {
      continue;
    }
    msgConfig[param] = txtParam.value;
  }
};

function setMessageConfig(newConfig) {
  for (let [key, val] of Object.entries(newConfig)) {
    if (msgConfig.hasOwnProperty(key)) {
      msgConfig[key] = val;
    }
  }
};


/*
 * SECTION: Message Archiving Functions
 */
async function toggleArchiveWindow(e, to_state=null) {
  const pnArchiveMsg = document.getElementsByClassName("archive-window")[0];
  if (to_state != null) {
    pnArchiveMsg.style.display = to_state;
    if (to_state == "none") {
      const savedChats = await getArchiveData();
      displaySavedChats(savedChats);
    }
  }

  if (pnArchiveMsg.style.display == "flex") {
    pnArchiveMsg.style.display = "none";
  } else {
    pnArchiveMsg.style.display = "flex";
    const savedChats = await getArchiveData();
    displaySavedChats(savedChats);
  }
};

function displaySavedChats(archivedChats) {
  const pnArchiveList = document.getElementsByClassName("archive-list")[0];

  pnArchiveList.innerHTML = "";

  let idx = 0;
  for (const ac of archivedChats) {
    const acDiv = document.createElement("div");
    acDiv.classList.add('archive-item');

    const header = document.createElement("b");
    header.textContent = ac.title.substring(0,30) + "...";

    const desc = document.createElement("p");
    desc.textContent = ac.messages[1].content.substring(0,100) + "...";

    const btnPanel = document.createElement("div");
    btnPanel.classList.add("archive-window-btn-panel");

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete Ⓧ";
    deleteBtn.value = idx; 
    deleteBtn.onclick = deleteArchivedChat;
    btnPanel.appendChild(deleteBtn);

    const saveJSONBtn = document.createElement("button");
    saveJSONBtn.textContent = "Save JSON ↓";
    saveJSONBtn.value = idx;
    saveJSONBtn.onclick = saveChatJSON;
    btnPanel.appendChild(saveJSONBtn);

    const saveTextFileBtn = document.createElement("button");
    saveTextFileBtn.textContent = "Save Text ↓";
    saveTextFileBtn.value = idx;
    saveTextFileBtn.onclick = saveChatTextFile;
    btnPanel.appendChild(saveTextFileBtn);

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Reload »";
    loadBtn.value = idx; 
    loadBtn.onclick = reloadArchivedChat;
    btnPanel.appendChild(loadBtn);

    acDiv.appendChild(header);
    acDiv.appendChild(desc);
    acDiv.appendChild(btnPanel);
    pnArchiveList.appendChild(acDiv);

    idx++;
  }

  return;
};

function filterArchivableMessages(messages) {
  const filteredMessages = [];
  for (const m of messages) { 
    if ((m.role == 'user') || (m.role == 'assistant')) {
      filteredMessages.push(m);
    }
  }

  return filteredMessages;
};

async function getArchiveData() {
  const savedChats = await retrieveData("savedChats");
  if (savedChats == null) {
    const localSavedChats = localStorage.getItem("savedChats");
    if (localSavedChats == null) {
      return [];
    }
    await storeData("savedChats", localSavedChats);
    return JSON.parse(localSavedChats);
  }
  return JSON.parse(savedChats);
};

async function saveCurrentChat() {
  let savedChats = await getArchiveData(); 

  const archivableMessages = filterArchivableMessages(allMessages);
  savedChats.push({
    title: currentChatTitle,
    messages: archivableMessages
  });

  await storeData("savedChats", JSON.stringify(savedChats));

  displaySavedChats(savedChats);
};

async function saveChatJSON(e) {
  const chat_id = e.target.value;
  const savedChats = await getArchiveData();

  const jsonBlob = new Blob(
    [ JSON.stringify(savedChats[chat_id], null, 2) ],
    { 'type' : 'application/json' }
  );

  const url = URL.createObjectURL(jsonBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'chat_data.json';

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function saveChatTextFile(e) {
  const chat_id = e.target.value;
  const savedChats = await getArchiveData();
  const targetChat = savedChats[chat_id].messages;

  /* Convert chat to a text file */
  let textFileStr = "";
  for (const m of targetChat) {
    textFileStr += "=======" + m.role.toUpperCase() + "=======\n\n";
    textFileStr += m.content + "\n\n";
  }

  /* Create blob */
  const textFileBlob =  new Blob(
    [ textFileStr ],
    { type : 'text/plain' }
  );

  const url = URL.createObjectURL(textFileBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = "chat_data.txt";

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function deleteArchivedChat(e) {
  const userConfirmed = confirm("Are you sure you want to delete this archived chat?");
  if (userConfirmed !== true) {
    return;
  }

  const chat_id = e.target.value;
  let savedChats = await getArchiveData();

  savedChats.splice(chat_id, 1);

  await storeData("savedChats", JSON.stringify(savedChats));
  displaySavedChats(savedChats);
};

async function reloadArchivedChat(e) {
  const chat_id = e.target.value;
  const savedChats = await getArchiveData();
  const archivedChat = savedChats[chat_id];

  allMessages.length = 0;
  allMessages.push({
      id: 0,
      role: "system", 
      content: currSystemMsg.content,
  });

  for (let cm of archivedChat.messages) {
    cm.id = allMessages.length;
    if (!cm.hasOwnProperty("edited")) {
      cm.edited = false;
    }
    allMessages.push(cm);
  }

  updateMessageDisplay();
  updateChatTitle(archivedChat.title);
  toggleArchiveWindow();
};


/*
 * SECTION: System Message Functions
 */
async function toggleSystemWindow(e, to_state=null) {
  const pnSystemMsg = document.getElementsByClassName("sys-window")[0];
  if (to_state != null) {
    pnSystemMsg.style.display = to_state;
    if (to_state != 'none') {
      await getSystemMessages();
      updateSelectSysMsgDropdownContent();
      txtSysMsg.value = currSystemMsg.content; 
    }
    return;
  }

  if (pnSystemMsg.style.display == "flex") {
    pnSystemMsg.style.display = "none";
  } else {
    pnSystemMsg.style.display = "flex";

    await getSystemMessages();
    updateSelectSysMsgDropdownContent();

    txtSysMsg.value = currSystemMsg.content;
  }
};

async function toggleSaveSysMsgPanel(e, to_state=null) {
  const pnNewSysMsg = document.getElementsByClassName("sys-msg-new-panel")[0];
  if (to_state != null) {
    pnNewSysMsg.style.display = to_state;
    return;
  }

  if (pnNewSysMsg.style.display == "flex") {
    pnNewSysMsg.style.display = "none";
  } else {
    pnNewSysMsg.style.display = "flex";
  }
  e.preventDefault();
};

function updateSelectSysMsgDropdownContent() {
  const drdSysMsg = document.getElementsByClassName("sys-msg-dropdown")[0];
  const pnSelectMsg = document.getElementsByClassName("sys-msg-select-panel")[0];

  drdSysMsg.innerHTML = "";
  for (m of systemMessages) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    drdSysMsg.append(opt);
  }

  drdSysMsg.value = currSystemMsg.id;
};

async function saveSystemMessages() {
  await storeData("savedSysMsgs", JSON.stringify(systemMessages));
};

async function getSystemMessages() {
  await getCurrentSystemMessage();

  let rawData = await retrieveData("savedSysMsgs");
  if (rawData == null) {
    const localRawData = localStorage.getItem("savedSysMsgs");
    if (localRawData == null) {
      systemMessages = [
        {
          id: 0,
          name: "Default",
          content: "You are an AI assistant."
        }
      ];
      await storeData("savedSysMsgs", JSON.stringify(systemMessages));
      return systemMessages;
    }
    rawData = localRawData;
    await storeData("savedSysMsgs", rawData);
  }
  systemMessages = JSON.parse(rawData);
  for (let i = 0; i < systemMessages.length; i++) {
    systemMessages[i].id = i;
  }
  return systemMessages;
};

async function addSystemMessage(e) {
  e.preventDefault();
  const txtSysMsgName = document.getElementsByClassName("sys-msg-title-input")[0];

  if ((txtSysMsgName.value == "") || (txtSysMsg.value == "")) {
    return;
  }

  const newSysMsg = {
    name: txtSysMsgName.value,
    content: txtSysMsg.value,
    id: systemMessages.length
  };

  systemMessages.push(newSysMsg);
  await saveSystemMessages();

  updateSelectSysMsgDropdownContent();
  drdSysMsg.value = systemMessages.length-1;

  toggleSaveSysMsgPanel(null, to_state='none');
};

async function deleteSystemMessage(e) {
  e.preventDefault();
  const selIdx = drdSysMsg.value;

  systemMessages.splice(selIdx, 1);
  await saveSystemMessages();
  updateSelectSysMsgDropdownContent();
};

function handleSystemMessageSelect(e) {
  const selIdx = parseInt(e.target.value);
  const txtSysMsgName = document.getElementsByClassName("sys-msg-title-input")[0];

  txtSysMsgName.value = systemMessages[selIdx].name;
  txtSysMsg.value = systemMessages[selIdx].content;

  e.preventDefault();
};

async function getCurrentSystemMessage() {
  const rawData = localStorage.getItem("currSysMsg");
  if (rawData == null) {
    return {
      id: 0,
      name: "Default",
      content: "You are an AI assistant."
    };
  }
  currSystemMsg = JSON.parse(rawData);
  return currSystemMsg;
};

async function setCurrentSystemMessage(e) {
  e.preventDefault();
  const txtSysMsgName = document.getElementsByClassName("sys-msg-title-input")[0];

  if (systemMessages == null) {
    await getSystemMessages();
  }

  let sysMsgId = null;
  for (const m of systemMessages) {
    if (m.name == txtSysMsgName.value) {
      console.log(txtSysMsgName.value);
      sysMsgId = m.id;
      break;
    }
  }

  currSystemMsg = {
    id: sysMsgId,
    name: txtSysMsgName.value,
    content: txtSysMsg.value,
  };

  localStorage.setItem("currSysMsg", JSON.stringify(currSystemMsg));

  allMessages[0].content = currSystemMsg.content;

  toggleSystemWindow(null, to_state='none');
};

