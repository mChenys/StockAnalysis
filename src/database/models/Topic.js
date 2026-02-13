const mongoose = require('mongoose');

const TopicSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    relevance: { type: Number, default: 0 },
    relatedSymbols: [{ type: String }],
    lastMentionedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

class InMemoryTopic {
    constructor(data) {
        Object.assign(this, data);
        this._id = Date.now().toString();
    }
    async save() {
        if (!InMemoryTopic.storage) InMemoryTopic.storage = new Map();
        InMemoryTopic.storage.set(this.name, this);
        return this;
    }
    static async find() { return this.storage ? Array.from(this.storage.values()) : []; }
    static async findOne(query) { return this.storage ? this.storage.get(query.name) : null; }
}

let ExportedTopic;
if (global.isInMemory) {
    ExportedTopic = InMemoryTopic;
} else {
    try { ExportedTopic = mongoose.model('Topic', TopicSchema); }
    catch (e) { ExportedTopic = InMemoryTopic; }
}
module.exports = ExportedTopic;
