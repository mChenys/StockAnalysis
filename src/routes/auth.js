const express = require('express');
const router = express.Router();
const User = require('../database/models/User');
const {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
} = require('../middleware/auth');
const logger = require('../utils/logger');

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username, email, and password are required'
            });
        }

        const existingUser = await User.findByUsernameOrEmail(username);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Username or email already exists'
            });
        }

        const user = new User({
            username,
            email: email.toLowerCase(),
            password
        });

        await user.save();

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        logger.info(`New user registered: ${username}`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: user.toJSON(),
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        const user = await User.findByUsernameOrEmail(username);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        if (!user.active) {
            return res.status(403).json({
                success: false,
                message: 'Account is inactive'
            });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        user.lastLogin = new Date();
        await user.save();

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        logger.info(`User logged in: ${username}`);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: user.toJSON(),
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        const decoded = verifyRefreshToken(refreshToken);
        const user = await User.findById(decoded.userId).select('-password');

        if (!user || !user.active) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        res.json({
            success: true,
            data: {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken
            }
        });
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
});

router.post('/logout', async (req, res) => {
    res.json({
        success: true,
        message: 'Logout successful'
    });
});

module.exports = router;
