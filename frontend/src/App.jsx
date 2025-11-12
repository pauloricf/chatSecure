// 🚀 APLICAÇÃO PRINCIPAL - CHATSECURE
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import './App.css';

// 🛡️ Componente de Rota Protegida
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>🔒 ChatSecure</h2>
          <p>Carregando aplicação segura...</p>
        </div>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// 🚪 Componente de Rota Pública (apenas para usuários não autenticados)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>🔒 ChatSecure</h2>
          <p>Carregando aplicação segura...</p>
        </div>
      </div>
    );
  }
  
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Routes>
            {/* 🏠 Rota raiz - redireciona baseado na autenticação */}
            <Route 
              path="/" 
              element={
                <AuthRedirect />
              } 
            />
            
            {/* 🚪 Rotas públicas (apenas para usuários não autenticados) */}
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              } 
            />
            
            <Route 
              path="/register" 
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              } 
            />
            
            {/* 🛡️ Rotas protegidas (apenas para usuários autenticados) */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            
            {/* 🚫 Rota 404 - Página não encontrada */}
            <Route 
              path="*" 
              element={
                <div className="not-found">
                  <div className="not-found-content">
                    <span className="not-found-icon">🔍</span>
                    <h1>404</h1>
                    <h2>Página não encontrada</h2>
                    <p>A página que você está procurando não existe.</p>
                    <button 
                      onClick={() => window.location.href = '/'}
                      className="back-home-button"
                    >
                      🏠 Voltar ao início
                    </button>
                  </div>
                </div>
              } 
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

// 🔄 Componente para redirecionamento baseado na autenticação
const AuthRedirect = () => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>🔒 ChatSecure</h2>
          <p>Carregando aplicação segura...</p>
        </div>
      </div>
    );
  }
  
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
};

export default App;
