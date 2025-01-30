// Constantes y variables globales
const ELEMENTS = {
  chatContainer: document.getElementById('chat-container'),
  userInput: document.getElementById('user-input'),
  serverUrlInput: document.getElementById('server-url'),
  connectButton: document.getElementById('connect-button'),
  connectionStatus: document.getElementById('connection-status'),
  sendButton: document.getElementById('send-button')
};

let isConnected = false;
let currentModel = '';

// Funciones principales
const addMessage = (content, isUser, metrics = null) => {
  const messageDiv = createMessageElement(isUser, content, metrics);
  ELEMENTS.chatContainer.appendChild(messageDiv);
  ELEMENTS.chatContainer.scrollTop = ELEMENTS.chatContainer.scrollHeight;
};

const connectToServer = async () => {
  const serverUrl = ELEMENTS.serverUrlInput.value.trim();
  if (!serverUrl) {
    updateConnectionStatus('Por favor, introduce una dirección válida', false);
    return;
  }

  try {
    updateConnectionStatus('Conectando...', false);
    const data = await fetchModels(serverUrl);
    handleSuccessfulConnection(data);
  } catch (error) {
    handleConnectionError(error);
  }
};

const sendMessage = async () => {
  const message = ELEMENTS.userInput.value.trim();
  if (!message || !isConnected) return;

  addMessage(message, true);
  ELEMENTS.userInput.value = '';
  disableUserInput(true);

  const serverUrl = ELEMENTS.serverUrlInput.value.trim();
  const startTime = performance.now();

  const assistantMessageDiv = createAssistantMessageElement();
  ELEMENTS.chatContainer.appendChild(assistantMessageDiv);

  try {
    await streamResponse(serverUrl, message, assistantMessageDiv);
    addMetricsToMessage(assistantMessageDiv, startTime);
  } catch (error) {
    handleSendMessageError(error);
  } finally {
    disableUserInput(false);
  }
};

// Funciones auxiliares
const createMessageElement = (isUser, content, metrics) => {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', isUser ? 'user-message' : 'assistant-message');
  messageDiv.innerHTML = `
    <div class="message-header">${isUser ? 'Tú' : 'Asistente'}</div>
    ${!isUser && currentModel ? `<div class="message-model">${currentModel}</div>` : ''}
    <div class="message-content">${content}</div>
    ${metrics ? `<div class="message-metrics">${metrics}</div>` : ''}
  `;
  return messageDiv;
};

const updateConnectionStatus = (message, connected) => {
  ELEMENTS.connectionStatus.textContent = message;
  ELEMENTS.connectionStatus.style.color = connected ? 'var(--accent-color)' : '#f44336';
  ELEMENTS.connectButton.textContent = connected ? 'Desconectar' : 'Conectar';
  ELEMENTS.serverUrlInput.disabled = connected;
  disableUserInput(!connected);
};

const fetchModels = async (serverUrl) => {
  const response = await fetch(`${serverUrl}/v1/models`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Server response was not ok');
  return response.json();
};

const handleSuccessfulConnection = (data) => {
  if (data?.data?.length > 0) {
    currentModel = data.data[0].id;
    isConnected = true;
    updateConnectionStatus('Conectado', true);
    addMessage('Conectado a LM Studio Server. ¡Ya puedes chatear!', false);
  } else {
    throw new Error('No hay modelos disponibles');
  }
};

const handleConnectionError = (error) => {
  console.error('Error:', error);
  updateConnectionStatus('Fallo al conectar', false);
  addMessage('Error: Incapaz de conectar con LM Studio server. Por favor, comprueba la dirección y prueba de nuevo.', false);
};

const createAssistantMessageElement = () => {
  const assistantMessageDiv = document.createElement('div');
  assistantMessageDiv.classList.add('message', 'assistant-message');
  assistantMessageDiv.innerHTML = `
    <div class="message-header">Assistant</div>
    ${currentModel ? `<div class="message-model">${currentModel}</div>` : ''}
    <div class="message-content"></div>
  `;
  return assistantMessageDiv;
};

const streamResponse = async (serverUrl, message, assistantMessageDiv) => {
  const response = await fetch(`${serverUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: currentModel,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: message }
      ],
      temperature: 0.0,
      max_tokens: -1,
      stream: true
    }),
  });

  if (!response.ok) throw new Error('Server response was not ok');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data === '[DONE]') break;
        
        try {
          const json = JSON.parse(data);
          const content = json.choices[0].delta?.content || '';
          assistantMessageDiv.querySelector('.message-content').textContent += content;
          ELEMENTS.chatContainer.scrollTop = ELEMENTS.chatContainer.scrollHeight;
        } catch (e) {
          console.error('Error parsing JSON:', e);
        }
      }
    }
  }
};

const addMetricsToMessage = (messageDiv, startTime) => {
  const endTime = performance.now();
  const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
  const metricsDiv = document.createElement('div');
  metricsDiv.classList.add('message-metrics');
  metricsDiv.textContent = `Time: ${timeElapsed}s`;
  messageDiv.appendChild(metricsDiv);
};

const handleSendMessageError = (error) => {
  console.error('Error:', error);
  addMessage('Error: Incapaz de obtener una respuesta del servidor. Inténtalo de nuevo.', false);
  isConnected = false;
  updateConnectionStatus('Desconectado', false);
};

const disableUserInput = (disabled) => {
  ELEMENTS.userInput.disabled = disabled;
  ELEMENTS.sendButton.disabled = disabled;
  if (!disabled) ELEMENTS.userInput.focus();
};

// Event listeners
ELEMENTS.connectButton.addEventListener('click', () => {
  if (isConnected) {
    isConnected = false;
    updateConnectionStatus('Desconectado', false);
    addMessage('Desconectado de LM Studio server.', false);
    currentModel = '';
  } else {
    connectToServer();
  }
});

ELEMENTS.userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

ELEMENTS.sendButton.addEventListener('click', sendMessage);

// Inicialización
ELEMENTS.serverUrlInput.focus();
