import React, { createContext, useContext, useState, useEffect } from 'react';
import apiService from '../services/apiService';
import cryptoService from '../services/cryptoService';

/**
 * 🔐 CONTEXTO DE AUTENTICAÇÃO
 * Gerencia o estado de autenticação do usuário em toda a aplicação.
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
  const [certificate, setCertificate] = useState(null); // inclui privateKey em memória
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Verificar autenticação ao carregar a aplicação
  useEffect(() => {
    checkAuthStatus();
  }, []);

  /**
   * 🔍 VERIFICAR STATUS DE AUTENTICAÇÃO
   * Recupera token + userData da sessionStorage
   * Recupera certificado (sem privateKey) do localStorage
   */
  const checkAuthStatus = () => {
    try {
      const token = sessionStorage.getItem('authToken');
      const userData = sessionStorage.getItem('userData');
      const storedCertificate = localStorage.getItem('userCertificate');

      if (token && userData) {
        setUser(JSON.parse(userData));
        const parsedCert = storedCertificate ? JSON.parse(storedCertificate) : null;
        setCertificate(parsedCert); // aqui NÃO tem privateKey ainda
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
        email: userData.email,
      });
      // Esperado: { privateKey: 'PEM...', publicKey: 'PEM...', certificate: 'PEM...' }

      // 2. Criptografar chave privada com senha do usuário
      const encryptedPrivateKeyData = cryptoService.encryptPrivateKeyWithPassword(
        keyPairWithCertificate.privateKey,
        userData.password
      );
      // Esperado: { encryptedPrivateKey, salt, iv }

      // 3. Preparar dados para envio (certificado PEM)
      const registrationData = {
        ...userData,
        certificate: keyPairWithCertificate.certificate,
      };

      // 4. Enviar certificado autoassinado para o servidor
      const response = await apiService.register(registrationData);
      // Esperado: { user, token, certificate: { id, serialNumber, publicKeyPem, certificatePem, ... } }

      // 5. Montar objeto de certificado para persistência (SEM privateKey)
      const certificateToPersist = {
        id: response.certificate.id,
        serialNumber: response.certificate.serialNumber,
        publicKeyPem: response.certificate.publicKeyPem,
        certificatePem: response.certificate.certificatePem,
        subject: response.certificate.subject,
        issuer: response.certificate.issuer,
        validFrom: response.certificate.validFrom,
        validTo: response.certificate.validTo,
        encryptedPrivateKey: encryptedPrivateKeyData,
      };

      // 6. Salvar no localStorage (apenas chave privada CRIPTOGRAFADA)
      localStorage.setItem('userCertificate', JSON.stringify(certificateToPersist));

      // 7. No estado em memória, podemos guardar também a privateKey em claro
      const certificateInState = {
        ...certificateToPersist,
        privateKey: keyPairWithCertificate.privateKey,
      };

      setUser(response.user);
      setCertificate(certificateInState);
      setIsAuthenticated(true);

      console.log('✅ Registro concluído com certificado autoassinado e chave privada criptografada no cliente');

      return { success: true, data: response };
    } catch (error) {
      console.error('❌ Erro no registro:', error);
      return {
        success: false,
        error: error.message || 'Erro ao registrar usuário',
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
      console.log('🔍 Login OK, carregando certificado e descriptografando chave privada...');

      // Recuperar certificado persistido (com encryptedPrivateKey)
      const storedCertificate = localStorage.getItem('userCertificate');
      let certificateWithPrivateKey = response.certificate
        ? {
            id: response.certificate.id,
            serialNumber: response.certificate.serialNumber,
            publicKeyPem: response.certificate.publicKeyPem,
            certificatePem: response.certificate.certificatePem,
            subject: response.certificate.subject,
            issuer: response.certificate.issuer,
            validFrom: response.certificate.validFrom,
            validTo: response.certificate.validTo,
          }
        : null;

      if (storedCertificate && storedCertificate !== 'null') {
        try {
          const parsedStoredCert = JSON.parse(storedCertificate);

          if (parsedStoredCert.encryptedPrivateKey) {
            // Descriptografar a chave privada usando a MESMA senha do login
            const decryptedPrivateKey = cryptoService.decryptPrivateKeyWithPassword(
              parsedStoredCert.encryptedPrivateKey,
              credentials.password
            );

            certificateWithPrivateKey = {
              ...parsedStoredCert,
              // caso o backend tenha retornado algo atualizado no certificate
              ...certificateWithPrivateKey,
              privateKey: decryptedPrivateKey,
            };
          } else {
            console.warn('⚠️ Certificado armazenado não possui encryptedPrivateKey.');
          }
        } catch (e) {
          console.error('❌ Erro ao processar certificado armazenado:', e);
        }
      } else {
        console.warn('⚠️ Nenhum certificado com chave privada encontrado no localStorage.');
      }

      setUser(response.user);
      setCertificate(certificateWithPrivateKey);
      setIsAuthenticated(true);

      return { success: true, data: response };
    } catch (error) {
      console.error('❌ Erro no login:', error);
      return {
        success: false,
        error: error.message || 'Credenciais inválidas',
      };
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🚪 FAZER LOGOUT
   */
  const logout = () => {
    apiService.logout?.(); // se tiver implementação
    setUser(null);
    setCertificate(null);
    setIsAuthenticated(false);
    // Você pode optar por limpar token/userData aqui, se quiser:
    // sessionStorage.removeItem('authToken');
    // sessionStorage.removeItem('userData');
  };

  /**
   * 🔄 ATUALIZAR DADOS DO USUÁRIO
   */
  const updateUser = (userData) => {
    setUser(userData);
    sessionStorage.setItem('userData', JSON.stringify(userData));
  };

  /**
   * 🔑 ATUALIZAR CERTIFICADO (por exemplo, após regenerar)
   * Aqui SEMPRE salvamos no localStorage apenas a versão criptografada da privateKey
   */
  const updateCertificate = (certificateData) => {
    setCertificate(certificateData);
    const toPersist = { ...certificateData };
    delete toPersist.privateKey; // não persiste privateKey em claro
    localStorage.setItem('userCertificate', JSON.stringify(toPersist));
  };

  /**
   * 🔁 REGERAR CERTIFICADO
   * Backend retorna um novo certificado + privateKey em PEM
   */
  const regenerateCertificate = async (password) => {
    try {
      setLoading(true);
      const response = await apiService.regenerateCertificate(password);
      const cert = response?.certificate;
      if (!cert || !cert.privateKey) {
        throw new Error('Falha ao regenerar certificado');
      }

      const encryptedData = cryptoService.encryptPrivateKeyWithPassword(cert.privateKey, password);

      const certificateToPersist = {
        id: cert.id,
        serialNumber: cert.serialNumber,
        publicKeyPem: cert.publicKeyPem,
        certificatePem: cert.certificatePem,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        encryptedPrivateKey: encryptedData,
      };

      // Persistir apenas versão criptografada
      localStorage.setItem('userCertificate', JSON.stringify(certificateToPersist));

      // Em memória, salvar também privateKey
      const certificateInState = {
        ...certificateToPersist,
        privateKey: cert.privateKey,
      };

      setCertificate(certificateInState);

      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao regenerar certificado:', error);
      return { success: false, error: error.message || 'Erro ao regenerar certificado' };
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🔍 OBTER CHAVE PRIVADA DO USUÁRIO
   * Usa apenas o que já está em memória (setado no login/registro/regeneração)
   */
  const getPrivateKey = () => {
    if (!certificate) {
      console.error('❌ Certificado não encontrado');
      throw new Error('Certificado não encontrado. Faça login novamente.');
    }

    if (!certificate.privateKey) {
      console.error('❌ Chave privada não está carregada na memória');
      throw new Error('Chave privada não está carregada. Faça login novamente.');
    }

    if (!certificate.privateKey.includes('-----BEGIN') || !certificate.privateKey.includes('-----END')) {
      console.error('❌ Chave privada não está em formato PEM válido');
      throw new Error('Chave privada não está em formato PEM válido.');
    }

    return certificate.privateKey;
  };

  /**
   * 🔍 OBTER CHAVE PÚBLICA DO USUÁRIO
   */
  const getPublicKey = () => {
    if (!certificate) {
      throw new Error('Certificado não encontrado');
    }
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
    regenerateCertificate,
    getPrivateKey,
    getPublicKey,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
export { AuthProvider, useAuth };
