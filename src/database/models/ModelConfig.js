const mongoose = require('mongoose');

const ModelConfigSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    provider: { type: String, required: true },
    apiKey: { type: String, required: true },
    baseUrl: { type: String, default: '' },
    model: { type: String, required: true },
    maxTokens: { type: Number, default: 4000 },
    temperature: { type: Number, default: 0.7 },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

class InMemoryModelConfig {
    constructor(data) {
        Object.assign(this, data);
        this._id = Date.now().toString();
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }
    async save() {
        if (!InMemoryModelConfig.storage) InMemoryModelConfig.storage = new Map();
        InMemoryModelConfig.storage.set(this.name, this);
        return this;
    }
    static async find(query = {}) {
        if (!this.storage) return [];
        let results = Array.from(this.storage.values());
        if (query.active !== undefined) results = results.filter(item => item.active === query.active);
        return results;
    }
    static async deleteOne(query) {
        if (this.storage && query.name) this.storage.delete(query.name);
    }
    static async findOneAndUpdate(query, update) {
        if (!this.storage) return null;
        const model = this.storage.get(query.name);
        if (model) { Object.assign(model, update); model.updatedAt = new Date(); return model; }
        return null;
    }
}

let ExportedModel;
if (global.isInMemory) {
    ExportedModel = InMemoryModelConfig;
} else {
    try { ExportedModel = mongoose.model('ModelConfig', ModelConfigSchema); }
    catch (e) { ExportedModel = InMemoryModelConfig; }
}
module.exports = ExportedModel;
