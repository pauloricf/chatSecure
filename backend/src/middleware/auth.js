const jwt = require('jsonwebtoken');
const { prisma } = require('../database/prisma');

// Middleware de autenticação
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Token de acesso necessário' 
      });
    }

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuário no banco usando Prisma
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true
      }
    });
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Usuário não encontrado' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Conta desativada' 
      });
    }

    // Adicionar usuário ao request
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token inválido' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expirado' 
      });
    }

    console.error('Erro na autenticação:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor' 
    });
  }
};

// Gerar token JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET, 
    { expiresIn: '24h' }
  );
};

// Middleware para autorizar apenas o dono do recurso
const authorizeOwner = (resourceUserIdField = 'user_id') => {
  return (req, res, next) => {
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    if (req.user.id !== resourceUserId) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: você só pode acessar seus próprios recursos'
      });
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  generateToken,
  authorizeOwner
};