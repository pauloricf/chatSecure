import axios from 'axios';

/**
 * 🌐 SERVIÇO DE API
 * 
 * Centraliza todas as chamadas para o backend do ChatSecure.
 * Gerencia autenticação, interceptadores e tratamento de erros.
 */
class ApiService {
  constructor() {
    // URL base do backend
    this.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    
    // Criar instância do axios
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Configurar interceptadores
    this.setupInterceptors();
  }

  /**
   * 🔧 CONFIGURAR INTERCEPTADORES
   */
  setupInterceptors() {
    // Interceptador de requisição - adiciona token automaticamente
    this.api.interceptors.request.use(
      (config) => {
        const token = sessionStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Interceptador de resposta - trata erros globalmente
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expirado ou inválido
          this.logout();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * 🔐 AUTENTICAÇÃO
   */

  // Registrar novo usuário
  async register(userData) {
    try {
      const response = await this.api.post('/auth/register', userData);
      
      // Salvar apenas token e dados do usuário no sessionStorage (isolado por aba)
      // O certificado será gerenciado pelo AuthContext para incluir chaves privadas
      if (response.data.token) {
        sessionStorage.setItem('authToken', response.data.token);
        sessionStorage.setItem('userData', JSON.stringify(response.data.user));
        // Não salvar certificado aqui - será gerenciado pelo AuthContext
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro no registro:', error);
      throw this.handleError(error);
    }
  }

  // Fazer login
  async login(credentials) {
    try {
      const response = await this.api.post('/auth/login', credentials);
      
      // Salvar apenas token e dados do usuário no sessionStorage (isolado por aba)
      // O certificado será gerenciado pelo AuthContext para incluir chaves privadas
      if (response.data.token) {
        sessionStorage.setItem('authToken', response.data.token);
        sessionStorage.setItem('userData', JSON.stringify(response.data.user));
        // Não salvar certificado aqui - será gerenciado pelo AuthContext
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Erro no login:', error);
      throw this.handleError(error);
    }
  }

  // Fazer logout
  logout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userData');
    // IMPORTANTE: NÃO remover userCertificate - ele contém a chave privada criptografada
    // que precisa ser preservada para logins futuros
    // sessionStorage.removeItem('userCertificate');
    console.log('🚪 Logout realizado - certificado preservado no sessionStorage');
  }

  // Verificar se está autenticado
  isAuthenticated() {
    return !!sessionStorage.getItem('authToken');
  }

  // Obter dados do usuário atual
  getCurrentUser() {
    const userData = sessionStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
  }

  // Obter certificado do usuário atual
  getCurrentUserCertificate() {
    const certificate = sessionStorage.getItem('userCertificate');
    return certificate ? JSON.parse(certificate) : null;
  }

  /**
   * 👥 USUÁRIOS
   */

  // Buscar usuários
  async searchUsers(query) {
    try {
      const response = await this.api.get(`/users/search?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao buscar usuários:', error);
      throw this.handleError(error);
    }
  }

  // Obter perfil de usuário
  async getUserProfile(userId) {
    try {
      const response = await this.api.get(`/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao obter perfil:', error);
      throw this.handleError(error);
    }
  }

  // Obter chave pública de um usuário
  async getUserPublicKey(userId) {
    try {
      const response = await this.api.get(`/users/${userId}/public-key`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao obter chave pública:', error);
      throw this.handleError(error);
    }
  }

  /**
   * 💬 MENSAGENS
   */

  // Enviar mensagem criptografada
  async sendMessage(messageData) {
    try {
      const response = await this.api.post('/messages', messageData);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      throw this.handleError(error);
    }
  }

  // Obter conversas do usuário
  async getConversations() {
    try {
      const response = await this.api.get('/messages/conversations');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao obter conversas:', error);
      throw this.handleError(error);
    }
  }

  // Obter mensagens de uma conversa
  async getMessages(userId, page = 1, limit = 50) {
    try {
      const response = await this.api.get(`/messages/conversation/${userId}?page=${page}&limit=${limit}`);
      console.log('Resposta completa da API /messages/conversation:', response);
      console.log('Dados da resposta:', response.data);
      return response;
    } catch (error) {
      console.error('❌ Erro ao obter mensagens:', error);
      throw this.handleError(error);
    }
  }

  // Obter usuários disponíveis
  async getUsers() {
    try {
      const response = await this.api.get('/users');
      console.log('Resposta completa da API /users:', response);
      console.log('Dados da resposta:', response.data);
      return response;
    } catch (error) {
      console.error('❌ Erro ao obter usuários:', error);
      throw this.handleError(error);
    }
  }

  // Marcar mensagem como lida
  async markMessageAsRead(messageId) {
    try {
      const response = await this.api.patch(`/messages/${messageId}/read`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao marcar como lida:', error);
      throw this.handleError(error);
    }
  }

  // Verificar assinatura de mensagem
  async verifyMessageSignature(messageId) {
    try {
      const response = await this.api.get(`/messages/${messageId}/verify`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao verificar assinatura:', error);
      throw this.handleError(error);
    }
  }

  /**
   * 🔑 CERTIFICADOS
   */

  // Obter certificados do usuário
  async getUserCertificates() {
    try {
      const response = await this.api.get('/certificates');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao obter certificados:', error);
      throw this.handleError(error);
    }
  }

  // Revogar certificado
  async revokeCertificate(serialNumber) {
    try {
      const response = await this.api.post(`/certificates/${serialNumber}/revoke`);
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao revogar certificado:', error);
      throw this.handleError(error);
    }
  }

  /**
   * 🔧 UTILITÁRIOS
   */

  // Verificar status da API
  async checkHealth() {
    try {
      const response = await this.api.get('/health');
      return response.data;
    } catch (error) {
      console.error('❌ Erro ao verificar status:', error);
      throw this.handleError(error);
    }
  }

  // Tratar erros da API
  handleError(error) {
    if (error.response) {
      // Erro da resposta do servidor
      return {
        message: error.response.data?.error || error.response.data?.message || 'Erro do servidor',
        status: error.response.status,
        data: error.response.data
      };
    } else if (error.request) {
      // Erro de rede
      return {
        message: 'Erro de conexão com o servidor',
        status: 0,
        data: null
      };
    } else {
      // Erro na configuração da requisição
      return {
        message: error.message || 'Erro desconhecido',
        status: -1,
        data: null
      };
    }
  }
}

// Exportar instância singleton
// Criar instância única e exportar
const apiService = new ApiService();
export { apiService };
export default apiService;