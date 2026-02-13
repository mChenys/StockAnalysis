const jwt = require('jsonwebtoken');
const User = require('../database/models/User');
const logger = require('../utils/logger');

/**
 * 验证JWT令牌的中间件
 */
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        
        // 兼容处理：内存模式不支持链式 .select()
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.active) {
            return res.status(403).json({
                success: false,
                message: 'User account is inactive'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('JWT verification error:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Access token expired'
            });
        }
        
        return res.status(403).json({
            success: false,
            message: 'Invalid access token'
        });
    }
}

/**
 * 检查用户角色的中间件生成器
 * @param  {...string} roles - 允许的角色列表
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (roles.length === 0) {
            return next();
        }

        const hasRole = req.user.hasAnyRole(...roles);
        
        if (!hasRole) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
                required: roles,
                userRoles: req.user.roles
            });
        }

        next();
    };
}

/**
 * 可选的身份验证中间件
 * 如果提供了令牌则验证，否则继续执行
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (error, decoded) => {
        if (error) {
            req.user = null;
        } else {
            User.findById(decoded.userId).select('-password')
                .then(user => {
                    req.user = user || null;
                    next();
                })
                .catch(() => {
                    req.user = null;
                    next();
                });
        }
    });
}

/**
 * 生成JWT访问令牌
 * @param  {Object} user - 用户对象
 * @param  {string} expiresIn - 过期时间 (例如: '7d', '1h')
 */
function generateAccessToken(user, expiresIn = '7d') {
    return jwt.sign(
        {
            userId: user._id,
            username: user.username,
            roles: user.roles
        },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn }
    );
}

/**
 * 生成JWT刷新令牌
 * @param  {Object} user - 用户对象
 */
function generateRefreshToken(user) {
    return jwt.sign(
        {
            userId: user._id,
            type: 'refresh'
        },
        process.env.JWT_SECRET || 'your_jwt_secret',
        { expiresIn: '30d' }
    );
}

/**
 * 验证刷新令牌
 * @param  {string} token - 刷新令牌
 */
function verifyRefreshToken(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid refresh token');
        }
        
        return decoded;
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
}

module.exports = {
    authenticateToken,
    authorize,
    optionalAuth,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
};
