import React, { createContext, useContext, useState, useEffect } from 'react';
import apiService from '../services/apiService';
import cryptoService from '../services/cryptoService';

/**
 * 🔐 CONTEXTO DE AUTENTICAÇÃO
 * 
 * Gerencia o estado de autenticação do usuário em toda a aplicação.
 * Fornece funções para login, logout e verificação de autenticação.
 */
const AuthContext = createContext();

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Verificar autenticação ao carregar a aplicação
  useEffect(() => {
    checkAuthStatus();
  }, []);

  /**
   * 🔍 VERIFICAR STATUS DE AUTENTICAÇÃO
   */
  const checkAuthStatus = () => {
    try {
      const token = sessionStorage.getItem('authToken');
      const userData = sessionStorage.getItem('userData');
      const userCertificate = sessionStorage.getItem('userCertificate');

      console.log('🔍 Verificando autenticação...');
      console.log('📄 Certificate no sessionStorage:', userCertificate);

      if (token && userData) {
        setUser(JSON.parse(userData));
        const parsedCertificate = userCertificate ? JSON.parse(userCertificate) : null;
        console.log('📄 Certificate parseado:', parsedCertificate);
        setCertificate(parsedCertificate);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setCertificate(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('❌ Erro ao verificar autenticação:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  /**
   * 📝 REGISTRAR USUÁRIO
   */
  const register = async (userData) => {
    try {
      setLoading(true);
      
      console.log('🔑 Gerando par de chaves e certificado autoassinado no cliente...');
      
      // 1. Gerar par de chaves e certificado autoassinado no cliente
      const keyPairWithCertificate = cryptoService.generateKeyPairWithCertificate({
        username: userData.username,
        email: userData.email
      });
      
      // 2. Criptografar chave privada com senha do usuário
      const encryptedPrivateKeyData = cryptoService.encryptPrivateKeyWithPassword(
        keyPairWithCertificate.privateKey, 
        userData.password
      );
      
      // 3. Preparar dados para envio (certificado completo)
      const registrationData = {
        ...userData,
        certificate: keyPairWithCertificate.certificate
      };
      
      // 4. Enviar certificado autoassinado para o servidor
      const response = await apiService.register(registrationData);
      
      // 5. Armazenar chave privada criptografada no sessionStorage
      const certificateWithEncryptedKey = {
        ...response.certificate,
        encryptedPrivateKey: encryptedPrivateKeyData
      };
      
      console.log('🔍 Debug - Certificado com chave criptografada a ser salvo:', {
        ...certificateWithEncryptedKey,
        encryptedPrivateKey: certificateWithEncryptedKey.encryptedPrivateKey ? 'PRESENTE' : 'AUSENTE'
      });
      
      // 6. Atualizar sessionStorage com certificado que inclui chave privada criptografada
      sessionStorage.setItem('userCertificate', JSON.stringify(certificateWithEncryptedKey));
      
      console.log('✅ Certificado salvo no sessionStorage');
      console.log('🔍 Debug - Verificando se foi salvo:', sessionStorage.getItem('userCertificate') ? 'SALVO' : 'NÃO SALVO');
      
      setUser(response.user);
      setCertificate(certificateWithEncryptedKey);
      setIsAuthenticated(true);
      
      console.log('✅ Registro concluído com certificado autoassinado e chave privada criptografada no cliente');
      
      return { success: true, data: response };
    } catch (error) {
      console.error('❌ Erro no registro:', error);
      return { 
        success: false, 
        error: error.message || 'Erro ao registrar usuário' 
      };
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🔑 FAZER LOGIN
   */
  const login = async (credentials) => {
    try {
      setLoading(true);
      const response = await apiService.login(credentials);
      
      console.log('🔍 Debug - Response do servidor:', response);
      console.log('🔍 Debug - Certificate do servidor:', response.certificate);
      
      // Salvar senha temporariamente para descriptografia posterior se necessário
      sessionStorage.setItem('tempPassword', credentials.password);
      
      // Verificar se existe chave privada criptografada no sessionStorage
      const storedCertificate = sessionStorage.getItem('userCertificate');
      let certificateWithPrivateKey = { ...response.certificate };
      
      console.log('🔍 Debug - Certificado armazenado no sessionStorage (RAW):', storedCertificate);
      console.log('🔍 Debug - Tipo do certificado armazenado:', typeof storedCertificate);
      console.log('🔍 Debug - Certificado existe?', !!storedCertificate);
      
      if (storedCertificate && storedCertificate !== 'null') {
        console.log('✅ Certificado encontrado no sessionStorage, processando...');
        try {
          const parsedStoredCert = JSON.parse(storedCertificate);
          console.log('🔍 Debug - Certificado parseado:', parsedStoredCert);
          console.log('🔍 Debug - Campos do certificado parseado:', Object.keys(parsedStoredCert));
          console.log('🔍 Debug - Tem encryptedPrivateKey?', !!parsedStoredCert.encryptedPrivateKey);
          console.log('🔍 Debug - Valor da encryptedPrivateKey:', parsedStoredCert.encryptedPrivateKey);
          
          // Se existe chave privada criptografada armazenada, descriptografar
          if (parsedStoredCert.encryptedPrivateKey) {
            console.log('🔓 INICIANDO PROCESSO DE DESCRIPTOGRAFIA...');
            console.log('🔍 Debug - encryptedPrivateKey encontrada:', parsedStoredCert.encryptedPrivateKey);
            console.log('🔍 Debug - Tipo de encryptedPrivateKey:', typeof parsedStoredCert.encryptedPrivateKey);
            
            // A encryptedPrivateKey já é o objeto com { encryptedPrivateKey, salt, iv }
            const encryptedDataToDecrypt = parsedStoredCert.encryptedPrivateKey;
            
            // Verificar se tem os campos necessários
            if (!encryptedDataToDecrypt.encryptedPrivateKey || !encryptedDataToDecrypt.salt || !encryptedDataToDecrypt.iv) {
              console.error('❌ Dados de criptografia incompletos:', encryptedDataToDecrypt);
              throw new Error('Dados de criptografia incompletos');
            }
            
            console.log('🔍 Debug - Dados para descriptografia:', {
              hasEncryptedKey: !!encryptedDataToDecrypt.encryptedPrivateKey,
              hasSalt: !!encryptedDataToDecrypt.salt,
              hasIv: !!encryptedDataToDecrypt.iv
            });
            
            console.log('🔓 Chamando cryptoService.decryptPrivateKeyWithPassword...');
            const decryptedPrivateKey = cryptoService.decryptPrivateKeyWithPassword(
              encryptedDataToDecrypt,
              credentials.password
            );
            
            console.log('🔍 Debug - Resultado da descriptografia:', decryptedPrivateKey ? 'SUCESSO' : 'FALHOU');
            console.log('🔍 Debug - Chave privada descriptografada (primeiros 100 chars):', decryptedPrivateKey?.substring(0, 100));
            
            // IMPORTANTE: Usar o certificado armazenado como base e adicionar a chave descriptografada
            certificateWithPrivateKey = {
              ...parsedStoredCert,  // Usar o certificado completo do sessionStorage
              ...response.certificate,  // Sobrescrever com dados atualizados do servidor
              privateKey: decryptedPrivateKey,  // Adicionar chave descriptografada
              encryptedPrivateKey: parsedStoredCert.encryptedPrivateKey  // Manter chave criptografada
            };
            
            console.log('✅ CHAVE PRIVADA DESCRIPTOGRAFADA E ADICIONADA AO CERTIFICADO');
            console.log('🔍 Debug - Certificado final com chave privada:', {
              ...certificateWithPrivateKey,
              privateKey: certificateWithPrivateKey.privateKey ? 'PRESENTE' : 'AUSENTE',
              encryptedPrivateKey: certificateWithPrivateKey.encryptedPrivateKey ? 'PRESENTE' : 'AUSENTE'
            });
            console.log('🔍 Debug - Tipo da privateKey no certificado:', typeof certificateWithPrivateKey.privateKey);
            console.log('🔍 Debug - Primeiros 50 chars da privateKey:', certificateWithPrivateKey.privateKey?.substring(0, 50));
          } else {
            console.log('⚠️ Nenhuma chave privada criptografada encontrada no sessionStorage');
            console.log('🔍 Debug - Certificado parseado completo:', JSON.stringify(parsedStoredCert, null, 2));
          }
        } catch (decryptError) {
          console.error('❌ Erro ao descriptografar chave privada:', decryptError);
          // Se falhar na descriptografia, continuar sem a chave privada
          // O usuário pode precisar fazer novo registro
          alert('Erro ao descriptografar chave privada. Você pode precisar fazer um novo registro.');
        }
      } else {
        console.log('⚠️ Nenhum certificado encontrado no sessionStorage');
      }
      
      setUser(response.user);
      setCertificate(certificateWithPrivateKey);
      setIsAuthenticated(true);
      
      console.log('🔍 Debug - Certificado sendo definido no contexto:', {
        ...certificateWithPrivateKey,
        privateKey: certificateWithPrivateKey.privateKey ? 'PRESENTE' : 'AUSENTE',
        encryptedPrivateKey: certificateWithPrivateKey.encryptedPrivateKey ? 'PRESENTE' : 'AUSENTE'
      });
      
      // IMPORTANTE: NÃO sobrescrever o sessionStorage aqui!
      // O certificado com encryptedPrivateKey já está salvo e deve ser preservado
      // Apenas atualizamos se conseguimos descriptografar com sucesso
      if (certificateWithPrivateKey.privateKey && storedCertificate) {
        console.log('✅ Mantendo certificado com chave privada criptografada no sessionStorage');
        // Não fazemos nada - o certificado já está correto no sessionStorage
      } else if (!storedCertificate) {
        console.log('⚠️ Nenhum certificado armazenado - usuário precisa se registrar novamente');
      }
      
      console.log('🔍 Debug - Certificado final definido no contexto:', {
        ...certificateWithPrivateKey,
        privateKey: certificateWithPrivateKey.privateKey ? 'PRESENTE' : 'AUSENTE'
      });
      
      return { success: true, data: response };
    } catch (error) {
      console.error('❌ Erro no login:', error);
      return { 
        success: false, 
        error: error.message || 'Credenciais inválidas' 
      };
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🚪 FAZER LOGOUT
   */
  const logout = () => {
    apiService.logout();
    setUser(null);
    setCertificate(null);
    setIsAuthenticated(false);
  };

  /**
   * 🔄 ATUALIZAR DADOS DO USUÁRIO
   */
  const updateUser = (userData) => {
    setUser(userData);
    sessionStorage.setItem('userData', JSON.stringify(userData));
  };

  /**
   * 🔑 ATUALIZAR CERTIFICADO
   */
  const updateCertificate = (certificateData) => {
    setCertificate(certificateData);
    sessionStorage.setItem('userCertificate', JSON.stringify(certificateData));
  };

  /**
   * 🔍 OBTER CHAVE PRIVADA DO USUÁRIO
   * 
   * IMPORTANTE: A chave privada agora é armazenada apenas no cliente
   * e não mais no banco de dados para maior segurança
   */
  const getPrivateKey = () => {
    console.log('🔑 getPrivateKey chamada - verificando certificado...');
    
    if (!certificate) {
      console.error('❌ Certificado não encontrado');
      throw new Error('Certificado não encontrado');
    }
    
    console.log('🔑 Certificate completo:', certificate);
    console.log('🔑 Private key do certificate:', certificate.privateKey);
    console.log('🔑 Tipo da privateKey:', typeof certificate.privateKey);
    
    // A chave privada agora está no campo privateKey (não mais privateKeyPem)
    const privateKey = certificate.privateKey;
    if (!privateKey) {
      console.error('❌ Chave privada não encontrada no certificado');
      console.log('🔍 Debug - Campos disponíveis no certificado:', Object.keys(certificate));
      console.log('🔍 Debug - Verificando se existe encryptedPrivateKey:', certificate.encryptedPrivateKey);
      
      // Se não tem privateKey mas tem encryptedPrivateKey, tentar descriptografar agora
      if (certificate.encryptedPrivateKey) {
        console.log('🔓 Tentando descriptografar chave privada agora...');
        
        // Verificar se temos a senha salva ou pedir para o usuário
        const savedPassword = sessionStorage.getItem('tempPassword');
        if (!savedPassword) {
          console.error('❌ Senha não disponível para descriptografia');
          throw new Error('Chave privada criptografada encontrada mas senha não disponível. Faça login novamente.');
        }
        
        try {
          const decryptedPrivateKey = cryptoService.decryptPrivateKeyWithPassword(
            certificate.encryptedPrivateKey,
            savedPassword
          );
          
          // Atualizar o certificado no contexto com a chave descriptografada
          const updatedCertificate = {
            ...certificate,
            privateKey: decryptedPrivateKey
          };
          
          setCertificate(updatedCertificate);
          console.log('✅ Chave privada descriptografada com sucesso');
          return decryptedPrivateKey;
        } catch (decryptError) {
          console.error('❌ Erro ao descriptografar chave privada:', decryptError);
          throw new Error('Erro ao descriptografar chave privada. Faça login novamente.');
        }
      }
      
      throw new Error('Chave privada não encontrada no certificado. Faça login novamente.');
    }
    
    if (!privateKey.includes('-----BEGIN') || !privateKey.includes('-----END')) {
      console.error('❌ Chave privada não está em formato PEM válido');
      console.log('🔍 Debug - Conteúdo da privateKey:', privateKey.substring(0, 200));
      throw new Error('Chave privada não está em formato PEM válido');
    }
    
    console.log('✅ Chave privada válida encontrada');
    return privateKey;
  };

  /**
   * 🔍 OBTER CHAVE PÚBLICA DO USUÁRIO
   */
  const getPublicKey = () => {
    if (!certificate) {
      throw new Error('Certificado não encontrado');
    }
    // A chave pública está no campo publicKeyPem
    return certificate.publicKeyPem;
  };

  const value = {
    // Estado
    user,
    certificate,
    loading,
    isAuthenticated,
    
    // Funções
    register,
    login,
    logout,
    updateUser,
    updateCertificate,
    getPrivateKey,
    getPublicKey,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
export { AuthProvider };

// ESLint disable para permitir exportação de hook junto com componente
// eslint-disable-next-line react-refresh/only-export-components
export { useAuth };