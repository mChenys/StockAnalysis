const express = require('express');
const router = express.Router();
const User = require('../database/models/User');
const { authenticateToken, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 20, role, active } = req.query;
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
