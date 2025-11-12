// 🏠 DASHBOARD PRINCIPAL - INTERFACE DE MENSAGENS CRIPTOGRAFADAS
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';
import { cryptoService } from '../services/cryptoService';
import websocketService from '../services/websocketService';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout, getPrivateKey } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [encryptionProcess, setEncryptionProcess] = useState(null);
  const [sentMessages, setSentMessages] = useState(new Map()); // Armazenar mensagens enviadas temporariamente
  const [shouldReloadMessages, setShouldReloadMessages] = useState(null); // Trigger para recarregar mensagens
  const messagesEndRef = useRef(null);

  // 🔄 Carregar usuários disponíveis
  useEffect(() => {
    loadUsers();
  }, []);

  // 🔌 Inicializar WebSocket
  useEffect(() => {
    const token = sessionStorage.getItem('authToken');
    if (token) {
      // Conectar ao WebSocket
      websocketService.connect(token);

      // Configurar handlers para mensagens
      websocketService.onMessage('new_message', (data) => {
        console.log('📨 Nova mensagem recebida via WebSocket:', data);
        console.log('🔍 Verificando conversa atual:', {
          selectedUser: selectedUser?.id,
          senderId: data.sender?.id,
          receiverId: data.receiver?.id,
          currentUserId: user?.id
        });
        
        // Se a mensagem é para o usuário atual (recebida) ou enviada pelo usuário atual
         const isMessageForCurrentUser = data.receiver?.id === user?.id || data.sender?.id === user?.id;
         
         if (isMessageForCurrentUser) {
           console.log('✅ Mensagem pertence ao usuário atual');
           
           // Determinar o usuário da conversa (quem não é o usuário atual)
           const conversationUserId = data.sender?.id === user?.id ? data.receiver?.id : data.sender?.id;
           const conversationUser = data.sender?.id === user?.id ? data.receiver : data.sender;
           
           // Se há um usuário selecionado e a mensagem é da conversa atual
           if (selectedUser && 
               ((data.sender?.id === selectedUser.id && data.receiver?.id === user?.id) || 
                (data.sender?.id === user?.id && data.receiver?.id === selectedUser.id))) {
             console.log('✅ Mensagem pertence à conversa atual, adicionando à lista...');
             
             // Adicionar mensagem diretamente à lista para exibição imediata
             const newMessage = {
               id: data.id,
               content: data.content,
               senderId: data.sender?.id,
               receiverId: data.receiver?.id,
               sender: data.sender,
               receiver: data.receiver,
               encryptedKey: data.encryptedKey,
               senderEncryptedKey: data.senderEncryptedKey,
               iv: data.iv,
               contentHash: data.contentHash,
               signature: data.signature,
               isEncrypted: data.isEncrypted,
               createdAt: new Date().toISOString(),
               isDecrypted: false,
               isSentByMe: data.sender?.id === user?.id
             };
             
             // Adicionar à lista de mensagens imediatamente
             setMessages(prevMessages => [...prevMessages, newMessage]);
             
             // Recarregar mensagens após um pequeno delay para garantir descriptografia
             setTimeout(() => {
               loadMessages(selectedUser.id);
             }, 500);
           } else if (!selectedUser && conversationUser) {
             console.log('💬 Nenhum usuário selecionado, selecionando automaticamente:', conversationUser.username);
             
             // Buscar dados completos do usuário (incluindo publicKey) da lista de usuários carregados
             const fullUserData = users.find(u => u.id === conversationUserId);
             
             if (fullUserData) {
               console.log('✅ Dados completos do usuário encontrados:', fullUserData);
               setSelectedUser(fullUserData);
             } else {
               console.log('⚠️ Dados completos não encontrados, usando dados básicos do WebSocket');
               setSelectedUser(conversationUser);
             }
             
             // Aguardar um momento para o estado ser atualizado e então carregar as mensagens
             setTimeout(() => {
               loadMessages(conversationUserId);
             }, 100);
           } else {
             console.log('💬 Mensagem recebida mas não há conversa ativa ou é de outro usuário');
             // Aqui você pode adicionar lógica para notificações ou atualizar lista de usuários
           }
         } else {
           console.log('❌ Mensagem não é para o usuário atual');
         }
      });

      websocketService.onMessage('message_read', (data) => {
        console.log('👁️ Mensagem marcada como lida:', data);
        // Atualizar status de leitura se necessário
        if (selectedUser) {
          loadMessages(selectedUser.id);
        }
      });

      websocketService.onConnect(() => {
        console.log('✅ WebSocket conectado com sucesso');
      });

      websocketService.onDisconnect(() => {
        console.log('🔌 WebSocket desconectado');
      });
    }

    // Cleanup ao desmontar componente
    return () => {
      websocketService.disconnect();
      websocketService.clearHandlers();
    };
  }, []);

  // 📜 Carregar mensagens quando um usuário é selecionado
  useEffect(() => {
    if (selectedUser) {
      loadMessages(selectedUser.id);
    }
  }, [selectedUser]);

  // 📜 Auto-scroll para a última mensagem
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 🔄 Recarregar mensagens quando shouldReloadMessages muda
  useEffect(() => {
    if (shouldReloadMessages && selectedUser) {
      console.log('🔄 Recarregando mensagens após atualização do sentMessages...');
      loadMessages(selectedUser.id);
      setShouldReloadMessages(null); // Reset do trigger
    }
  }, [shouldReloadMessages, selectedUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 👥 Carregar lista de usuários
  const loadUsers = async () => {
    try {
      const response = await apiService.getUsers();
      console.log('Resposta da API getUsers:', response);
      
      // A API retorna: { data: { success: true, users: [...] } }
      if (response && response.data && response.data.users && Array.isArray(response.data.users)) {
        // Filtrar o usuário atual da lista
        const otherUsers = response.data.users.filter(u => u.id !== user.id);
        setUsers(otherUsers);
        console.log('Usuários carregados:', otherUsers);
      } else if (response && response.data && Array.isArray(response.data)) {
        // Fallback: se os dados estiverem diretamente em response.data
        const otherUsers = response.data.filter(u => u.id !== user.id);
        setUsers(otherUsers);
      } else if (response && Array.isArray(response)) {
        // Fallback: se a resposta for diretamente um array
        const otherUsers = response.filter(u => u.id !== user.id);
        setUsers(otherUsers);
      } else {
        console.error('Estrutura de resposta inesperada:', response);
        setError('Erro: estrutura de dados inválida');
      }
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      setError('Erro ao carregar usuários: ' + (error.message || 'Erro desconhecido'));
    }
  };

   // 📨 Carregar mensagens com um usuário específico
   const loadMessages = async (userId) => {
     try {
       setLoading(true);
       const response = await apiService.getMessages(userId);
       console.log('📨 Resposta da API getMessages:', response);
       
       // Verificar se a resposta tem a estrutura esperada
       const messages = response?.messages || response?.data?.messages || [];
       
       if (!Array.isArray(messages)) {
         console.error('Mensagens não são um array:', messages);
         setMessages([]);
         return;
       }
       
       console.log('🗂️ Estado atual do sentMessages no loadMessages:', Array.from(sentMessages.entries()));
       console.log('🗂️ Mensagens carregadas da API:', messages.map(m => ({ id: m.id, senderId: m.senderId, content: m.content?.substring(0, 50) })));
       
       // 🔓 Descriptografar mensagens recebidas
       const decryptedMessages = await Promise.all(
         messages.map(async (msg) => {
           try {
             if (msg.senderId === user.id) {
               // Mensagem enviada por mim - usar Encrypt-to-Self para descriptografar
               console.log('📤 Processando mensagem enviada por mim:');
               console.log('   - ID da mensagem:', msg.id);
               console.log('   - Tipo do ID:', typeof msg.id);
               console.log('   - Conteúdo criptografado:', msg.content?.substring(0, 50) + '...');
               
               // Primeiro, verificar se temos o conteúdo original armazenado temporariamente
               const originalContent = sentMessages.get(msg.id);
               console.log('   - Conteúdo original encontrado:', originalContent);
               console.log('   - Chaves disponíveis no sentMessages:', Array.from(sentMessages.keys()));
               
               if (originalContent) {
                 console.log('✅ Usando conteúdo original do cache:', originalContent);
                 return {
                   ...msg,
                   content: originalContent,
                   isDecrypted: true,
                   isSentByMe: true
                 };
               }
               
               // Se não temos o conteúdo original no cache, usar Encrypt-to-Self
               console.log('🔓 Usando Encrypt-to-Self para descriptografar mensagem enviada...');
               
               const privateKey = getPrivateKey();
               if (!privateKey) {
                 throw new Error('Chave privada não encontrada');
               }
               
               // Verificar se temos senderEncryptedKey (Encrypt-to-Self)
               if (msg.senderEncryptedKey) {
                 console.log('🔑 Usando senderEncryptedKey para descriptografar...');
                 
                 // Descriptografar usando a versão criptografada para o remetente
                 const decryptedContent = await cryptoService.decryptMessage(
                   msg.content, // Mensagem criptografada
                   msg.senderEncryptedKey, // Chave simétrica criptografada com minha chave pública
                   msg.iv,
                   privateKey // Minha chave privada para descriptografar
                 );
                 
                 return {
                   ...msg,
                   content: decryptedContent,
                   isDecrypted: true,
                   isSentByMe: true
                 };
               } else {
                 // Mensagem antiga sem Encrypt-to-Self
                 console.log('⚠️ Mensagem sem Encrypt-to-Self, exibindo mensagem genérica');
                 return {
                   ...msg,
                   content: 'Mensagem enviada (conteúdo criptografado)...',
                   isDecrypted: false,
                   isSentByMe: true
                 };
               }
             } else {
               // Mensagem recebida - descriptografar com minha chave privada
               console.log('🔓 Iniciando processo de descriptografia de mensagem recebida...');
               
               const privateKey = getPrivateKey();
               if (!privateKey) {
                 throw new Error('Chave privada não encontrada');
               }
               
               // Buscar chave pública do remetente para verificação de assinatura
               const senderData = await apiService.getUserPublicKey(msg.senderId);
               
               // Descriptografar mensagem recebida usando minha chave privada
               const decryptedContent = await cryptoService.decryptMessage(
                 msg.content, // Mensagem criptografada
                 msg.encryptedKey, // Chave simétrica criptografada com minha chave pública
                 msg.iv,
                 privateKey // Minha chave privada para descriptografar
               );
       
               // ✅ Verificar assinatura digital usando a chave pública do remetente
               const isSignatureValid = await cryptoService.verifySignature(
                 decryptedContent,
                 msg.signature,
                 senderData.publicKey
               );
       
               return {
                 ...msg,
                 content: decryptedContent,
                 isDecrypted: true,
                 signatureValid: isSignatureValid,
                 isSentByMe: false
               };
             }
           } catch (decryptError) {
             console.error('Erro ao descriptografar mensagem:', decryptError);
             return {
               ...msg,
               content: '❌ Erro ao descriptografar mensagem',
               isDecrypted: false,
               signatureValid: false
             };
           }
         })
       );

       console.log('🎯 Mensagens processadas:', decryptedMessages.map(m => ({ 
         id: m.id, 
         isSentByMe: m.isSentByMe, 
         content: m.content?.substring(0, 50) + '...' 
       })));

       setMessages(decryptedMessages);
     } catch (error) {
       console.error('Erro ao carregar mensagens:', error);
       setError('Erro ao carregar mensagens');
     } finally {
       setLoading(false);
     }
   };

  // 📤 Enviar mensagem criptografada
  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !selectedUser) {
      setError('Digite uma mensagem e selecione um destinatário');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // 🔐 PROCESSO DE CRIPTOGRAFIA HÍBRIDA
      setEncryptionProcess({
        step: 1,
        description: 'Iniciando criptografia híbrida...'
      });

      // Usar o método de criptografia híbrida completa
      const privateKey = getPrivateKey();
      console.log('🔑 Chave privada obtida:', privateKey);
      console.log('🔑 Tipo da chave privada:', typeof privateKey);
      console.log('🔑 Primeiros 100 caracteres:', privateKey?.substring(0, 100));
      
      // Debug da chave pública
      console.log('🔑 Debug - selectedUser completo:', selectedUser);
      console.log('🔑 Debug - publicKey tipo:', typeof selectedUser.publicKey);
      console.log('🔑 Debug - publicKey valor:', selectedUser.publicKey);
      console.log('🔑 Debug - publicKey primeiros 100 chars:', selectedUser.publicKey?.substring(0, 100));
      
      // Verificar se a publicKey está presente e obter dados completos se necessário
      let publicKeyToUse = selectedUser.publicKey;
      
      if (!publicKeyToUse) {
        console.error('❌ PublicKey não encontrada no selectedUser. Tentando buscar dados completos...');
        
        // Buscar dados completos do usuário na lista de usuários
        const fullUserData = users.find(u => u.id === selectedUser.id);
        
        if (fullUserData && fullUserData.publicKey) {
          console.log('✅ Dados completos encontrados, atualizando selectedUser...');
          setSelectedUser(fullUserData);
          publicKeyToUse = fullUserData.publicKey;
        } else {
          throw new Error('Chave pública do destinatário não encontrada. Recarregue a página e tente novamente.');
        }
      }
      
      const encryptedData = await cryptoService.encryptMessage(
        newMessage,
        publicKeyToUse,
        privateKey
      );

      setEncryptionProcess({
        step: 2,
        description: 'Enviando mensagem criptografada...'
      });

      // 📨 Enviar mensagem criptografada para o backend
      const response = await apiService.sendMessage({
        recipientId: selectedUser.id,
        encryptedMessage: encryptedData.encryptedMessage,
        encryptedKey: encryptedData.encryptedKey,
        senderEncryptedKey: encryptedData.senderEncryptedKey,
        iv: encryptedData.iv,
        signature: encryptedData.signature,
        messageHash: encryptedData.messageHash
      });

      console.log('📨 Resposta completa da API sendMessage:', response);
      console.log('📨 Tipo da resposta:', typeof response);
      console.log('📨 Chaves da resposta:', Object.keys(response || {}));

      // Armazenar o conteúdo original da mensagem enviada temporariamente
      // O backend retorna: { success: true, message: '...', messageId: message.id, ... }
      // O apiService retorna response.data, então messageId está diretamente em response.messageId
      const messageId = response.messageId;
      
      console.log('📨 MessageId encontrado:', messageId);
      
      if (messageId) {
        setSentMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, newMessage);
          console.log('💾 Conteúdo original armazenado para messageId:', messageId, 'conteúdo:', newMessage);
          console.log('💾 Estado atual do sentMessages:', Array.from(newMap.entries()));
          return newMap;
        });
        
        // Trigger para recarregar mensagens após o estado ser atualizado
        setShouldReloadMessages(Date.now());
      } else {
        console.warn('⚠️ Não foi possível obter messageId da resposta:', response);
        // Recarregar mensagens mesmo sem messageId
        setShouldReloadMessages(Date.now());
      }

      // ✅ Sucesso
      setSuccess('Mensagem enviada com segurança!');
      setNewMessage('');
      setEncryptionProcess(null);

    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      setError('Erro ao enviar mensagem: ' + error.message);
      setEncryptionProcess(null);
    } finally {
      setLoading(false);
    }
  };

  // 🚪 Logout
  const handleLogout = () => {
    logout();
  };

  // 📅 Formatar data
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="dashboard-container">
      {/* 🎯 HEADER */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">🔒</span>
            <h1>ChatSecure</h1>
          </div>
        </div>
        
        <div className="header-center">
          <div className="user-info">
            <span className="user-icon">👤</span>
            <span className="username">{user?.username}</span>
            <span className="user-status">🟢 Online</span>
          </div>
        </div>

        <div className="header-right">
          <button onClick={() => navigate('/benchmark')} className="benchmark-button">
            <span>📈</span>
            Benchmark
          </button>
          <button onClick={() => navigate('/security')} className="securitylab-button">
            <span>🧪</span>
            Segurança
          </button>
          <button onClick={handleLogout} className="logout-button">
            <span>🚪</span>
            Sair
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {/* 👥 LISTA DE USUÁRIOS */}
        <aside className="users-sidebar">
          <div className="sidebar-header">
            <h3>
              <span>👥</span>
              Usuários ({users.length})
            </h3>
          </div>
          
          <div className="users-list">
            {users.map(user => (
              <div
                key={user.id}
                className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="user-avatar">
                  <span>👤</span>
                </div>
                <div className="user-details">
                  <div className="user-name">{user.username}</div>
                  <div className="user-email">{user.email}</div>
                  <div className="user-status">
                    <span className="status-dot">🟢</span>
                    Online
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* 💬 ÁREA DE CHAT */}
        <main className="chat-area">
          {selectedUser ? (
            <>
              {/* 📋 HEADER DO CHAT */}
              <div className="chat-header">
                <div className="chat-user-info">
                  <span className="chat-avatar">👤</span>
                  <div>
                    <h3>{selectedUser.username}</h3>
                    <p>🔐 Comunicação criptografada end-to-end</p>
                  </div>
                </div>
                
                <div className="encryption-info">
                  <span className="encryption-badge">
                    🔒 RSA-2048 + AES-256
                  </span>
                </div>
              </div>

              {/* 📜 MENSAGENS */}
              <div className="messages-container">
                {loading && messages.length === 0 ? (
                  <div className="loading-messages">
                    <div className="spinner"></div>
                    <p>Carregando mensagens...</p>
                  </div>
                ) : (
                  <>
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`message ${message.senderId === user.id ? 'sent' : 'received'}`}
                      >
                        <div className="message-content">
                          <div className="message-text">
                            {message.isDecrypted === false && message.content ? 
                              '🔒 Descriptografando...' : 
                              message.content
                            }
                          </div>
                          
                          <div className="message-meta">
                            <span className="message-time">
                              {formatDate(message.createdAt)}
                            </span>
                            
                            {message.senderId !== user.id && message.isDecrypted !== false && (
                              <span className={`signature-status ${message.signatureValid ? 'valid' : 'invalid'}`}>
                                {message.signatureValid ? '✅ Verificado' : '❌ Não verificado'}
                              </span>
                            )}
                            
                            {message.senderId === user.id && (
                              <span className="sent-status">
                                📤 Enviado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* ✍️ ÁREA DE ENVIO */}
              <div className="message-input-area">
                {/* 🔐 PROCESSO DE CRIPTOGRAFIA */}
                {encryptionProcess && (
                  <div className="encryption-process">
                    <div className="process-header">
                      <span className="process-icon">🔐</span>
                      <span>Criptografando mensagem...</span>
                    </div>
                    <div className="process-step">
                      <span className="step-number">{encryptionProcess.step}/5</span>
                      <span className="step-description">{encryptionProcess.description}</span>
                    </div>
                    <div className="process-bar">
                      <div 
                        className="process-progress" 
                        style={{ width: `${(encryptionProcess.step / 5) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* 📝 FORMULÁRIO DE MENSAGEM */}
                <form onSubmit={sendMessage} className="message-form">
                  <div className="input-container">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      disabled={loading}
                      className="message-input"
                    />
                    <button
                      type="submit"
                      disabled={loading || !newMessage.trim()}
                      className="send-button"
                    >
                      {loading ? (
                        <div className="spinner"></div>
                      ) : (
                        <>
                          <span>🔒</span>
                          Enviar
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* ⚠️ MENSAGENS DE STATUS */}
                {error && (
                  <div className="status-message error">
                    <span>❌</span>
                    {error}
                  </div>
                )}
                
                {success && (
                  <div className="status-message success">
                    <span>✅</span>
                    {success}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* 🎯 ESTADO INICIAL */
            <div className="no-chat-selected">
              <div className="welcome-content">
                <span className="welcome-icon">💬</span>
                <h2>Bem-vindo ao ChatSecure</h2>
                <p>Selecione um usuário para iniciar uma conversa criptografada</p>
                
                <div className="security-features">
                  <h3>🔐 Recursos de Segurança:</h3>
                  <ul>
                    <li>🔒 <strong>Criptografia Híbrida:</strong> AES-256 + RSA-2048</li>
                    <li>✍️ <strong>Assinatura Digital:</strong> SHA256withRSA</li>
                    <li>🛡️ <strong>End-to-End:</strong> Apenas você e o destinatário podem ler</li>
                    <li>🔑 <strong>Chaves Temporárias:</strong> Nova chave para cada mensagem</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;