const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/auth');
const Task = require('../database/models/Task');
const cronManager = require('../services/cronManager');
const logger = require('../utils/logger');
const crypto = require('crypto');

// 内存模式备用存储
let inMemoryTasks = [];

router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        if (global.isInMemory) {
            return res.json({ success: true, data: inMemoryTasks });
        }
        const tasks = await Task.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, data: tasks });
    } catch (error) {
        logger.error(`Error fetching tasks: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
    }
});

router.post('/', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        const { name, description, type, cronExpression, parameters, active } = req.body;

        if (global.isInMemory) {
            const task = {
                _id: crypto.randomBytes(12).toString('hex'), // Fake ObjectId
                user: req.user._id,
                name, description, type, cronExpression, parameters,
                active: active !== undefined ? active : true,
                createdAt: new Date(),
                lastRunStatus: 'pending'
            };
            inMemoryTasks.push(task);
            if (task.active) cronManager.scheduleTask(task);
            return res.json({ success: true, message: 'Task created successfully', data: task });
        }

        let task = new Task({
            user: req.user._id,
            name,
            description,
            type,
            cronExpression,
            parameters,
            active: active !== undefined ? active : true
        });

        await task.save();

        if (task.active) {
            cronManager.scheduleTask(task);
        }

        res.json({ success: true, message: 'Task created successfully', data: task });
    } catch (error) {
        logger.error(`Error creating task: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to create task: ' + error.message });
    }
});

router.patch('/:id', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        if (global.isInMemory) {
            const task = inMemoryTasks.find(t => t._id === req.params.id);
            if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
            Object.assign(task, req.body);
            if (task.active) cronManager.scheduleTask(task);
            else cronManager.stopTask(task._id);
            return res.json({ success: true, message: 'Task updated successfully', data: task });
        }

        const task = await Task.findById(req.params.id);
        if (!task || task.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        Object.assign(task, req.body);
        await task.save();

        if (task.active) {
            cronManager.scheduleTask(task);
        } else {
            cronManager.stopTask(task._id.toString());
        }

        res.json({ success: true, message: 'Task updated successfully', data: task });
    } catch (error) {
        logger.error(`Error updating task: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to update task: ' + error.message });
    }
});

router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        if (global.isInMemory) {
            const index = inMemoryTasks.findIndex(t => t._id === req.params.id);
            if (index === -1) return res.status(404).json({ success: false, message: 'Task not found' });
            cronManager.stopTask(inMemoryTasks[index]._id);
            inMemoryTasks.splice(index, 1);
            return res.json({ success: true, message: 'Task deleted successfully' });
        }

        const task = await Task.findById(req.params.id);
        if (!task || task.user.toString() !== req.user._id.toString()) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        cronManager.stopTask(task._id.toString());
        await Task.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Task deleted successfully' });
    } catch (error) {
        logger.error(`Error deleting task: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to delete task: ' + error.message });
    }
});

router.post('/:id/run', authenticateToken, authorize('admin'), async (req, res) => {
    try {
        let task;
        if (global.isInMemory) {
            task = inMemoryTasks.find(t => t._id === req.params.id);
        } else {
            task = await Task.findById(req.params.id);
            if (!task || task.user.toString() !== req.user._id.toString()) {
                return res.status(404).json({ success: false, message: 'Task not found' });
            }
        }

        if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

        // Run instantly for testing, we can do it asynchronously
        cronManager.executeTask(task);

        res.json({ success: true, message: 'Task trigger submitted successfully. It is running in background.' });
    } catch (error) {
        logger.error(`Error manually running task: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to execute task manually: ' + error.message });
    }
});

module.exports = router;
// Expose for cronManager Updates in Memory mode
module.exports.getInMemoryTask = (id) => inMemoryTasks.find(t => t._id === id);
