// Global variables
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const serverUrlInput = document.getElementById('server-url');
const connectButton = document.getElementById('connect-button');
const connectionStatus = document.getElementById('connection-status');
const sendButton = document.getElementById('send-button');
const newChatButton = document.getElementById('new-chat-button');
const toggleSidebarButton = document.getElementById('toggle-sidebar');
const chatSidebar = document.getElementById('chat-sidebar');
const chatList = document.getElementById('chat-list');
const contextMenu = document.getElementById('context-menu');
const modelSelect = document.getElementById('model-select');
const uploadButton = document.getElementById('upload-button');
const imageUpload = document.getElementById('image-upload');
const imagePreview = document.getElementById('image-preview');

let isConnected = false;
let currentModel = '';
let pendingImage = null;

// Chat management: each chat has an id, name, and messages array.
let chats = [];
let currentChat = null;

// Helper: Attach copy code buttons to code blocks
function attachCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
	if (!pre.querySelector('.copy-btn')) {
	  pre.style.position = 'relative';
	  const button = document.createElement('button');
	  button.className = 'copy-btn';
	  button.innerHTML = '<i class="fas fa-copy"></i> Copy';
	  button.addEventListener('click', () => {
		const codeText = pre.querySelector('code').innerText;
		navigator.clipboard.writeText(codeText)
		  .then(() => {
			button.innerText = "¡Copiado!";
			setTimeout(() => {
			  button.innerHTML = '<i class="fas fa-copy"></i> Copy';
			}, 2000);
		  })
		  .catch(err => {
			console.error('Fallo al copiar código: ', err);
		  });
	  });
	  pre.appendChild(button);
	}
  });
}

// Adds a message to the DOM and (optionally) stores it.
// If store is false, the message is only displayed and not added to currentChat.messages.
function addMessage(content, isUser, metrics = null, store = true) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', isUser ? 'user-message' : 'assistant-message');

  const headerDiv = document.createElement('div');
  headerDiv.classList.add('message-header');
  headerDiv.textContent = isUser ? 'Tú' : 'Asistente';
  messageDiv.appendChild(headerDiv);

  if (!isUser && currentModel) {
	const modelDiv = document.createElement('div');
	modelDiv.classList.add('message-model');
	modelDiv.textContent = currentModel;
	messageDiv.appendChild(modelDiv);
  }

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.innerHTML = marked.parse(content);
  messageDiv.appendChild(contentDiv);

  if (metrics) {
	const metricsDiv = document.createElement('div');
	metricsDiv.classList.add('message-metrics');
	metricsDiv.textContent = metrics;
	messageDiv.appendChild(metricsDiv);
  }

  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  messageDiv.querySelectorAll('pre code').forEach(block => {
	hljs.highlightElement(block);
  });

  if (typeof MathJax !== 'undefined') {
	MathJax.typesetPromise([messageDiv]).catch(err => console.error('MathJax typeset failed:', err));
  }
  
  attachCopyButtons(messageDiv);
  
  if (store && currentChat) {
	currentChat.messages.push({ content, isUser, metrics, isImage: false });
  }
}

// Adds an image message.
function addImageMessage(dataURL, promptText) {
  // Display image message in the UI
  addMessage(`<img src="${dataURL}" style="max-width:100%; border-radius: var(--border-radius);" />`, true);
  // Mark the last message in the history as an image message
  const lastMsg = currentChat.messages[currentChat.messages.length - 1];
  lastMsg.isImage = true;
  lastMsg.imageData = dataURL;
  lastMsg.text = promptText;
}

// Creates a new chat.
function createNewChat() {
  const chatId = Date.now();
  const newChat = { id: chatId, name: `Conversación ${chats.length + 1}`, messages: [] };
  chats.push(newChat);
  currentChat = newChat;
  updateChatList();
  chatContainer.innerHTML = '';
}

// Renders the chat list in the sidebar.
function updateChatList() {
  chatList.innerHTML = '';
  chats.forEach(chat => {
	const li = document.createElement('li');
	li.textContent = chat.name;
	li.dataset.chatId = chat.id;
	if (currentChat && chat.id === currentChat.id) li.classList.add('active');
	li.addEventListener('click', () => {
	  if (currentChat && chat.id === currentChat.id) return;
	  currentChat = chat;
	  loadChat(chat);
	  updateChatList();
	});
	li.addEventListener('contextmenu', (e) => {
	  e.preventDefault();
	  showContextMenu(e.pageX, e.pageY, chat.id);
	});
	chatList.appendChild(li);
  });
}

// Loads a chat's messages into the chat container.
function loadChat(chat) {
  chatContainer.innerHTML = '';
  chat.messages.forEach(message => {
	// When loading, we display messages without storing them again.
	addMessage(message.content, message.isUser, message.metrics, false);
  });
}

// Custom context menu for deleting chats.
function showContextMenu(x, y, chatId) {
  contextMenu.style.left = x + "px";
  contextMenu.style.top = y + "px";
  contextMenu.style.display = "block";
  contextMenu.onclick = () => {
	deleteChat(chatId);
	hideContextMenu();
  };
}
function hideContextMenu() { contextMenu.style.display = "none"; }
document.addEventListener('click', () => { if (contextMenu.style.display === "block") hideContextMenu(); });
function deleteChat(chatId) {
  chats = chats.filter(c => c.id != chatId);
  if (currentChat && currentChat.id == chatId) {
	currentChat = chats.length > 0 ? chats[0] : null;
	if (!currentChat) createNewChat();
	else loadChat(currentChat);
  }
  updateChatList();
}

// Ejects the currently loaded model.
async function ejectCurrentModel(oldModel) {
  const serverUrl = serverUrlInput.value.trim();
  try {
	await fetch(`${serverUrl}/v1/model/eject`, {
	  method: 'POST',
	  headers: { 'Content-Type': 'application/json' },
	  body: JSON.stringify({ model: oldModel })
	});
	console.log(`Model ${oldModel} ejected.`);
  } catch (error) {
	console.error("Error al expulsar el modelo:", error);
  }
}

// Build conversation history without merging messages.
// The history starts with the system prompt, then includes each stored message in order.
function buildConversationHistory() {
  const systemPrompt = currentChat.messages.some(msg => msg.isImage)
	? "You are an AI assistant that analyzes images."
	: "You are an intelligent assistant. You always provide well-reasoned answers that are both correct and helpful.";
  const history = [{ role: 'system', content: systemPrompt }];
  currentChat.messages.forEach(msg => {
	if (msg.isImage) {
	  history.push({
		role: msg.isUser ? 'user' : 'assistant',
		content: [
		  { type: "text", text: msg.text || "What's in this image?" },
		  { type: "image_url", image_url: { url: msg.imageData } }
		]
	  });
	} else {
	  history.push({ role: msg.isUser ? 'user' : 'assistant', content: msg.content });
	}
  });
  return history;
}

// Model selection change: eject old model if needed.
modelSelect.addEventListener('change', async (e) => {
  const newModel = e.target.value;
  if (currentModel && currentModel !== newModel) {
	modelSelect.disabled = true;
	await ejectCurrentModel(currentModel);
  }
  currentModel = newModel;
  modelSelect.disabled = false;
});

// Connect to server and populate model dropdown.
async function connectToServer() {
  const serverUrl = serverUrlInput.value.trim();
  if (!serverUrl) {
	updateConnectionStatus('Por favor, introduce una dirección correcta', false);
	return;
  }
  try {
	updateConnectionStatus('Conectando...', false);
	const response = await fetch(`${serverUrl}/v1/models`, {
	  method: 'GET',
	  headers: { 'Content-Type': 'application/json' }
	});
	if (!response.ok) throw new Error('La respuesta no fue válida');
	const data = await response.json();
	if (data && data.data && data.data.length > 0) {
	  modelSelect.innerHTML = "";
	  data.data.forEach(model => {
		const option = document.createElement('option');
		option.value = model.id;
		option.textContent = model.id;
		modelSelect.appendChild(option);
	  });
	  modelSelect.disabled = false;
	  currentModel = modelSelect.value;
	  isConnected = true;
	  updateConnectionStatus('Conectado', true);
	  userInput.disabled = false;
	  sendButton.disabled = false;
	  if (!currentChat) createNewChat();
	  // Display connection message without storing it in the chat history
	  addMessage('Conectado a LM Studio server. Puedes empezar a chatear', false, null, false);
	} else {
	  throw new Error('Sin modelos disponibles');
	}
  } catch (error) {
	console.error('Error:', error);
	updateConnectionStatus('Fallo al conectar', false);
	addMessage('Error: Incapaz de conectar a LM Studio server. Comprueba la dirección e inténtalo de nuevo.', false);
  }
}

function updateConnectionStatus(message, connected) {
  connectionStatus.textContent = message;
  connectionStatus.style.color = connected ? 'var(--accent-color)' : '#f44336';
  connectButton.textContent = connected ? 'Desconectado' : 'Conectado';
  serverUrlInput.disabled = connected;
  userInput.disabled = !connected;
  sendButton.disabled = !connected;
}

// Send message: if a pending image exists, include it.
async function sendMessage() {
  let message = userInput.value.trim();
  if (!message && !pendingImage) return;

  if (pendingImage) {
	let promptText = message || "What's in this image?";
	addImageMessage(pendingImage, promptText);
	pendingImage = null;
	imagePreview.style.display = "none";
	userInput.value = "";
  } else {
	addMessage(message, true);
  }

  const conversationHistory = buildConversationHistory();

  // Create a temporary assistant message element for streaming response
  const assistantMessageElement = document.createElement('div');
  assistantMessageElement.classList.add('message', 'assistant-message');

  const headerDiv = document.createElement('div');
  headerDiv.classList.add('message-header');
  headerDiv.textContent = 'Asistente';
  assistantMessageElement.appendChild(headerDiv);

  if (currentModel) {
	const modelDiv = document.createElement('div');
	modelDiv.classList.add('message-model');
	modelDiv.textContent = currentModel;
	assistantMessageElement.appendChild(modelDiv);
  }

  const assistantContentDiv = document.createElement('div');
  assistantContentDiv.classList.add('message-content');
  assistantMessageElement.appendChild(assistantContentDiv);

  chatContainer.appendChild(assistantMessageElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  userInput.value = '';
  userInput.disabled = true;
  sendButton.disabled = true;

  const serverUrl = serverUrlInput.value.trim();
  const startTime = performance.now();
  let accumulatedText = '';

  try {
	const response = await fetch(`${serverUrl}/v1/chat/completions`, {
	  method: 'POST',
	  headers: { 'Content-Type': 'application/json' },
	  body: JSON.stringify({
		model: currentModel,
		messages: conversationHistory,
		temperature: 0.7,
		max_tokens: -1,
		stream: true
	  })
	});
	if (!response.ok) throw new Error('LA respuesta del servidor no fue ok');

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let done = false;
	while (!done) {
	  const { value, done: doneReading } = await reader.read();
	  done = doneReading;
	  if (value) {
		const chunk = decoder.decode(value, { stream: true });
		const lines = chunk.split('\n').filter(line => line.trim() !== '');
		for (const line of lines) {
		  if (line.startsWith("data:")) {
			const dataStr = line.slice(5).trim();
			if (dataStr === "[DONE]") { done = true; break; }
			try {
			  const parsed = JSON.parse(dataStr);
			  const delta = parsed.choices[0].delta;
			  if (delta && delta.content) {
				accumulatedText += delta.content;
				assistantContentDiv.innerHTML = marked.parse(accumulatedText);
				assistantMessageElement.querySelectorAll('pre code').forEach(block => {
				  hljs.highlightElement(block);
				});
				attachCopyButtons(assistantMessageElement);
				if (typeof MathJax !== 'undefined') {
				  MathJax.typesetPromise([assistantMessageElement]).catch(err => console.error(err));
				}
			  }
			} catch (err) {
			  console.error("Error parsing stream chunk", err);
			}
		  } else if (line.startsWith("event:")) {
			const eventType = line.slice(6).trim();
			if (eventType === "error") {
			  console.error("Received error event from server:", line);
			  addMessage("Error: Received error event from server", false);
			  done = true;
			  break;
			}
		  }
		}
	  }
	}
	const endTime = performance.now();
	const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
	if (currentChat) {
	  // Store the assistant message into the chat history
	  currentChat.messages.push({ content: accumulatedText, isUser: false, isImage: false });
	  if (currentChat.name.startsWith('Conversación')) {
		const snippet = accumulatedText.split(' ').slice(0, 7).join(' ');
		currentChat.name = snippet ? `Conversation: ${snippet}...` : currentChat.name;
		updateChatList();
	  }
	}
  } catch (error) {
	console.error('Error:', error);
	addMessage('Error: Incapaz de obtener respuesta del servidor. Por favor, inténtalo de nuevo.', false);
	isConnected = false;
	updateConnectionStatus('Desconectado', false);
  } finally {
	userInput.disabled = false;
	sendButton.disabled = false;
	userInput.focus();
  }
}

// Image upload: store image and show preview.
uploadButton.addEventListener('click', () => { imageUpload.click(); });
imageUpload.addEventListener('change', () => {
  const file = imageUpload.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
	pendingImage = e.target.result;
	imagePreview.innerHTML = `<img src="${pendingImage}" style="max-width:100%; border-radius: var(--border-radius);" />`;
	imagePreview.style.display = "block";
  };
  reader.readAsDataURL(file);
  imageUpload.value = "";
});

connectButton.addEventListener('click', () => {
  if (isConnected) {
	isConnected = false;
	updateConnectionStatus('Desconectado', false);
	userInput.disabled = true;
	sendButton.disabled = true;
	addMessage('Desconectado de LM Studio server.', false);
	currentModel = '';
	modelSelect.disabled = true;
  } else {
	connectToServer();
  }
});

userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
sendButton.addEventListener('click', sendMessage);
newChatButton.addEventListener('click', () => { createNewChat(); });
toggleSidebarButton.addEventListener('click', () => { chatSidebar.classList.toggle('collapsed'); });

serverUrlInput.focus();