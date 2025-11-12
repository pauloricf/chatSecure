// Middleware de tratamento de erros
const errorHandler = (err, req, res, next) => {
  console.error('Erro capturado:', err);

  // Erro de validação
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: err.message
    });
  }

  // Erro de banco de dados
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        return res.status(409).json({
          error: 'Recurso já existe',
          details: 'Dados duplicados encontrados'
        });
      
      case '23503': // Foreign key violation
        return res.status(400).json({
          error: 'Referência inválida',
          details: 'Recurso referenciado não existe'
        });
      
      case '23502': // Not null violation
        return res.status(400).json({
          error: 'Campo obrigatório',
          details: 'Campos obrigatórios não preenchidos'
        });
    }
  }

  // Erro JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado'
    });
  }

  // Erro de sintaxe JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'JSON inválido',
      details: 'Formato de dados incorreto'
    });
  }

  // Erro padrão
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Erro interno do servidor';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Middleware para capturar rotas não encontradas
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};