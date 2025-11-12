import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

/**
 * 🔑 COMPONENTE DE LOGIN
 * 
 * Interface de autenticação que se conecta com o backend
 * e gerencia o estado de login do usuário.
 */
const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  /**
   * 📝 MANIPULAR MUDANÇAS NO FORMULÁRIO
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Limpar erro quando usuário começar a digitar
    if (error) setError('');
  };

  /**
   * 🚀 SUBMETER FORMULÁRIO DE LOGIN
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validação básica
    if (!formData.username || !formData.password) {
      setError('Por favor, preencha todos os campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('🔑 Tentando fazer login...');
      const result = await login(formData);
      
      if (result.success) {
        console.log('✅ Login realizado com sucesso!');
        navigate('/chat');
      } else {
        // Verificar se é erro de rate limiting
        if (result.error && result.error.includes('429') || 
            (result.error && result.error.includes('Muitas tentativas'))) {
          setError('Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.');
        } else {
          setError(result.error || 'Erro ao fazer login');
        }
      }
    } catch (error) {
      console.error('❌ Erro no login:', error);
      
      // Verificar se é erro de rate limiting
      if (error.status === 429 || 
          (error.message && error.message.includes('429')) ||
          (error.data && error.data.includes('Muitas tentativas'))) {
        setError('Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.');
      } else {
        setError('Erro interno. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="logo">
            <div className="logo-icon">🔒</div>
            <h1>ChatSecure</h1>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          {/* Campo Username */}
          <div className="form-group">
            <label htmlFor="username">
              <span className="label-icon">👤</span>
              Usuário ou Email
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Digite seu usuário ou email"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          {/* Campo Password */}
          <div className="form-group">
            <label htmlFor="password">
              <span className="label-icon">🔑</span>
              Senha
            </label>
            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Digite sua senha"
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Botão de Login */}
          <button
            type="submit"
            className={`login-button ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Entrando...
              </>
            ) : (
              <>
                <span className="button-icon">🚀</span>
                Entrar
              </>
            )}
          </button>
        </form>

        {/* Links */}
        <div className="login-footer">
          <p>
            Não tem uma conta?{' '}
            <Link to="/register" className="register-link">
              Registre-se aqui
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;