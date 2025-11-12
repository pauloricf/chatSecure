import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Register.css';

/**
 * 📝 COMPONENTE DE REGISTRO
 * 
 * Interface para criação de nova conta com geração automática
 * de certificados e chaves criptográficas.
 */
const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register } = useAuth();
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
   * ✅ VALIDAR FORMULÁRIO
   */
  const validateForm = () => {
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      return 'Por favor, preencha todos os campos';
    }

    if (formData.username.length < 3) {
      return 'Nome de usuário deve ter pelo menos 3 caracteres';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return 'Por favor, insira um email válido';
    }

    if (formData.password.length < 8) {
      return 'Senha deve ter pelo menos 8 caracteres';
    }

    if (formData.password !== formData.confirmPassword) {
      return 'As senhas não coincidem';
    }

    return null;
  };

  /**
   * 🚀 SUBMETER FORMULÁRIO DE REGISTRO
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validação
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('📝 Criando nova conta...');
      const result = await register({
        username: formData.username,
        email: formData.email,
        password: formData.password
      });
      
      if (result.success) {
        console.log('✅ Conta criada com sucesso!');
        navigate('/chat');
      } else {
        setError(result.error || 'Erro ao criar conta');
      }
    } catch (error) {
      console.error('❌ Erro no registro:', error);
      setError('Erro interno. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        {/* Header */}
        <div className="register-header">
          <div className="logo">
            <div className="logo-icon">🔒</div>
            <h1>ChatSecure</h1>
          </div>
          <p className="subtitle">Crie sua conta e receba suas chaves criptográficas</p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="register-form">
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
              Nome de Usuário
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Escolha um nome de usuário único"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          {/* Campo Email */}
          <div className="form-group">
            <label htmlFor="email">
              <span className="label-icon">📧</span>
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="seu@email.com"
              disabled={loading}
              autoComplete="email"
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
                placeholder="Mínimo 8 caracteres"
                disabled={loading}
                autoComplete="new-password"
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

          {/* Campo Confirm Password */}
          <div className="form-group">
            <label htmlFor="confirmPassword">
              <span className="label-icon">🔒</span>
              Confirmar Senha
            </label>
            <div className="password-input">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Digite a senha novamente"
                disabled={loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
              >
                {showConfirmPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Botão de Registro */}
          <button
            type="submit"
            className={`register-button ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Criando conta e gerando chaves...
              </>
            ) : (
              <>
                <span className="button-icon">🚀</span>
                Criar Conta
              </>
            )}
          </button>
        </form>

        {/* Links */}
        <div className="register-footer">
          <p>
            Já tem uma conta?{' '}
            <Link to="/login" className="login-link">
              Faça login aqui
            </Link>
          </p>
        </div>

        {/* Processo de Registro */}
        <div className="registration-process">
          <h3>🔐 O que acontece ao criar sua conta:</h3>
          <div className="process-steps">
            <div className="step">
              <span className="step-number">1</span>
              <div className="step-content">
                <strong>Geração de Chaves RSA</strong>
                <p>Par de chaves única (pública/privada) de 2048 bits</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">2</span>
              <div className="step-content">
                <strong>Certificado Digital</strong>
                <p>Certificado auto-assinado para autenticação</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">3</span>
              <div className="step-content">
                <strong>Armazenamento Seguro</strong>
                <p>Chave privada criptografada com sua senha</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;