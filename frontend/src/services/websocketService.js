/**
 * 🔌 SERVIÇO DE WEBSOCKET
 * 
 * Gerencia a conexão WebSocket para recebimento de mensagens em tempo real
 */
class WebSocketService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000;
    this.messageHandlers = new Map();
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
  }

  /**
   * 🔗 Conectar ao WebSocket
   */
  connect(token) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket já está conectado');
      return;
    }

    const wsUrl = `ws://localhost:3001/ws?token=${token}`;
    console.log('🔌 Conectando ao WebSocket:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error('❌ Erro ao conectar WebSocket:', error);
    }
  }

  /**
   * 🎯 Configurar handlers de eventos
   */
  setupEventHandlers() {
    this.ws.onopen = (event) => {
      console.log('✅ WebSocket conectado');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Notificar handlers de conexão
      this.connectionHandlers.forEach(handler => handler(event));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 Mensagem WebSocket recebida:', data);
        
        // Chamar handler específico para o tipo de mensagem
        const handler = this.messageHandlers.get(data.type);
        if (handler) {
          handler(data);
        } else {
          console.warn('⚠️ Tipo de mensagem não reconhecido:', data.type);
        }
      } catch (error) {
        console.error('❌ Erro ao processar mensagem WebSocket:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('🔌 WebSocket desconectado:', event.code, event.reason);
      this.isConnected = false;
      
      // Notificar handlers de desconexão
      this.disconnectionHandlers.forEach(handler => handler(event));
      
      // Tentar reconectar se não foi fechamento intencional
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('❌ Erro no WebSocket:', error);
    };
  }

  /**
   * 🔄 Agendar reconexão
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    console.log(`🔄 Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${this.reconnectInterval}ms`);
    
    setTimeout(() => {
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
      if (token) {
        this.connect(token);
      }
    }, this.reconnectInterval);
  }

  /**
   * 📤 Enviar mensagem
   */
  send(type, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = { type, ...data };
      this.ws.send(JSON.stringify(message));
      console.log('📤 Mensagem enviada via WebSocket:', message);
    } else {
      console.warn('⚠️ WebSocket não está conectado');
    }
  }

  /**
   * 🎧 Registrar handler para tipo de mensagem
   */
  onMessage(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  /**
   * 🔗 Registrar handler para conexão
   */
  onConnect(handler) {
    this.connectionHandlers.push(handler);
  }

  /**
   * 🔌 Registrar handler para desconexão
   */
  onDisconnect(handler) {
    this.disconnectionHandlers.push(handler);
  }

  /**
   * ❌ Desconectar
   */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Desconexão intencional');
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * 🔍 Verificar se está conectado
   */
  isWebSocketConnected() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 🧹 Limpar handlers
   */
  clearHandlers() {
    this.messageHandlers.clear();
    this.connectionHandlers = [];
    this.disconnectionHandlers = [];
  }
}

// Instância singleton
const websocketService = new WebSocketService();

export default websocketService;