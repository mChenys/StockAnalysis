const mongoose = require('mongoose');

const FavoriteSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true }, // 存储 HTML 快照
    analysisData: { type: Object }, // 存储原始行情数据快照
    createdAt: { type: Date, default: Date.now }
});

class InMemoryFavorite {
    constructor(data) {
        Object.assign(this, data);
        this._id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        this.createdAt = new Date();
    }
    async save() {
        if (!InMemoryFavorite.storage) InMemoryFavorite.storage = new Map();
        InMemoryFavorite.storage.set(this._id, this);
        return this;
    }
    static async find(query = {}) {
        if (!this.storage) return [];
        let results = Array.from(this.storage.values());
        if (query.user) results = results.filter(f => f.user === query.user);
        return results;
    }
    static async findById(id) {
        return this.storage ? this.storage.get(id) : null;
    }
    static async deleteOne(query) {
        if (!this.storage) return;
        if (query._id) this.storage.delete(query._id);
    }
}

let ExportedFavorite;
if (global.isInMemory) {
    ExportedFavorite = InMemoryFavorite;
} else {
    try {
        ExportedFavorite = mongoose.model('Favorite', FavoriteSchema);
    } catch (e) {
        ExportedFavorite = InMemoryFavorite;
    }
}

module.exports = ExportedFavorite;
