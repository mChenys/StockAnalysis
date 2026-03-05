const express = require('express');
const router = express.Router();
const User = require('../database/models/User');
const { authenticateToken, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 20, role, active } = req.query;

        // 开发模式：返回模拟用户列表
        if (global.isInMemory) {
            const mockUsers = [
                {
                    _id: 'dev-admin',
                    username: 'dev-admin',
                    email: 'dev@admin.local',
                    roles: ['admin'],
                    active: true,
                    createdAt: new Date('2024-01-01'),
                    lastLogin: new Date()
                },
                {
                    _id: 'demo-analyst',
                    username: 'analyst',
                    email: 'analyst@example.com',
                    roles: ['analyst'],
                    active: true,
                    createdAt: new Date('2024-02-15'),
                    lastLogin: new Date('2024-03-01')
                },
                {
                    _id: 'demo-user',
                    username: 'testuser',
                    email: 'user@example.com',
                    roles: ['user'],
                    active: true,
                    createdAt: new Date('2024-03-10'),
                    lastLogin: null
                }
            ];

            return res.json({
                success: true,
                data: mockUsers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: mockUsers.length,
                    pages: 1
                }
            });
        }

        const skip = (page - 1) * limit;

        const query = {};
        if (role) {
            query.roles = role;
        }
        if (active !== undefined) {
            query.active = active === 'true';
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve users'
        });
    }
});

router.get('/me', authenticateToken, async (req, res) => {
    try {
        // 开发模式：返回虚拟用户信息
        if (global.isInMemory && req.user._id === 'dev-admin') {
            return res.json({
                success: true,
                data: {
                    _id: 'dev-admin',
                    username: 'dev-admin',
                    email: 'dev@admin.local',
                    roles: ['admin'],
                    active: true,
                    createdAt: new Date(),
                    lastLogin: new Date(),
                    preferences: { theme: 'light', notifications: true, language: 'zh-CN' }
                }
            });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve user'
        });
    }
});

router.get('/:userId', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { userId } = req.params;

        // 开发模式：返回模拟用户数据
        if (global.isInMemory) {
            const mockUsers = {
                'dev-admin': { _id: 'dev-admin', username: 'dev-admin', email: 'dev@admin.local', roles: ['admin'], active: true },
                'demo-analyst': { _id: 'demo-analyst', username: 'analyst', email: 'analyst@example.com', roles: ['analyst'], active: true },
                'demo-user': { _id: 'demo-user', username: 'testuser', email: 'user@example.com', roles: ['user'], active: true }
            };
            const user = mockUsers[userId];
            if (user) {
                return res.json({ success: true, data: user });
            }
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        logger.error('Get user by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve user'
        });
    }
});

router.put('/me', authenticateToken, async (req, res) => {
    try {
        const { username, email, preferences } = req.body;

        // 开发模式：返回成功模拟响应
        if (global.isInMemory && req.user._id === 'dev-admin') {
            return res.json({
                success: true,
                message: 'Profile updated successfully',
                data: {
                    _id: 'dev-admin',
                    username: username || 'dev-admin',
                    email: email || 'dev@admin.local',
                    roles: ['admin'],
                    active: true,
                    preferences: preferences || { theme: 'light', notifications: true, language: 'zh-CN' }
                }
            });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (username) {
            user.username = username;
        }
        if (email) {
            user.email = email.toLowerCase();
        }
        if (preferences) {
            user.preferences = { ...user.preferences, ...preferences };
        }

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user.toJSON()
        });
    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});

router.put('/me/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // 开发模式：返回成功模拟响应
        if (global.isInMemory && req.user._id === 'dev-admin') {
            // 开发模式下任何密码都可以
            return res.json({
                success: true,
                message: 'Password updated successfully'
            });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        user.password = newPassword;
        await user.save();

        logger.info(`Password changed for user: ${user.username}`);

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update password'
        });
    }
});

router.put('/:userId', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { roles, active, preferences } = req.body;

        if (userId === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot modify your own account through this endpoint'
            });
        }

        // 开发模式：返回成功模拟响应
        if (global.isInMemory) {
            return res.json({
                success: true,
                message: 'User updated successfully',
                data: {
                    _id: userId,
                    username: 'mock-user',
                    email: 'mock@example.com',
                    roles: roles || ['user'],
                    active: active !== undefined ? active : true,
                    preferences: preferences || {}
                }
            });
        }

        const updateData = {};
        if (roles) {
            updateData.roles = roles;
        }
        if (active !== undefined) {
            updateData.active = active;
        }
        if (preferences) {
            updateData.preferences = preferences;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        logger.info(`User updated by admin: ${user.username}`);

        res.json({
            success: true,
            message: 'User updated successfully',
            data: user
        });
    } catch (error) {
        logger.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user'
        });
    }
});

router.delete('/:userId', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { userId } = req.params;

        if (userId === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await User.findByIdAndDelete(userId);

        logger.info(`User deleted by admin: ${user.username}`);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
});

module.exports = router;
