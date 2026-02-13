const mongoose = require('mongoose');

const NewsItemSchema = new mongoose.Schema({
    sourceId: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    publishedAt: { type: Date, required: true },
    topics: [{ type: String }],
    relatedSymbols: [{ type: String }],
    sentimentScore: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

class InMemoryNewsItem {
    constructor(data) {
        Object.assign(this, data);
        this._id = Date.now().toString();
        this.createdAt = new Date();
    }
    async save() {
        if (!InMemoryNewsItem.storage) InMemoryNewsItem.storage = new Map();
        InMemoryNewsItem.storage.set(this.url, this);
        return this;
    }
    static async find() { return this.storage ? Array.from(this.storage.values()) : []; }
    static async findOne(query) { return this.storage ? this.storage.get(query.url) : null; }
}

let ExportedNews;
if (global.isInMemory) {
    ExportedNews = InMemoryNewsItem;
} else {
    try { ExportedNews = mongoose.model('NewsItem', NewsItemSchema); }
    catch (e) { ExportedNews = InMemoryNewsItem; }
}
module.exports = ExportedNews;
