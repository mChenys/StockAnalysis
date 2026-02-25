const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const MessageSchema = new Schema({
    role: {
        type: String,
        required: true,
        enum: ['user', 'assistant']
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const AgentSessionSchema = new Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: String,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        default: '新对话'
    },
    messages: [MessageSchema]
}, {
    timestamps: true
});

module.exports = mongoose.model('AgentSession', AgentSessionSchema);
