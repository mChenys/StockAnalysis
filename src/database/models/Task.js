const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    type: {
        type: String,
        required: true,
        enum: ['trendradar_report', 'market_monitor', 'weekly_summary', 'model_health', 'data_cleanup']
    },
    cronExpression: {
        type: String,
        required: true,
        default: '0 8 * * *' // 默认每天早上8点
    },
    active: {
        type: Boolean,
        default: true
    },
    parameters: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    lastRunAt: {
        type: Date
    },
    lastRunStatus: {
        type: String,
        enum: ['success', 'error', 'running', 'pending'],
        default: 'pending'
    },
    lastRunMessage: {
        type: String
    },
    totalRunCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
