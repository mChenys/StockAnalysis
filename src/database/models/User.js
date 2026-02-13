const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    roles: [{ type: String, enum: ['admin', 'analyst', 'user'], default: 'user' }],
    preferences: { theme: { type: String, default: 'light' }, notifications: { type: Boolean, default: true }, language: { type: String, default: 'zh-CN' } },
    active: { type: Boolean, default: true },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.toJSON = function() {
    const user = typeof this.toObject === 'function' ? this.toObject() : { ...this };
    delete user.password;
    return user;
};

UserSchema.statics.findByUsernameOrEmail = function(identifier) {
    return this.findOne({
        $or: [
            { username: identifier },
            { email: identifier.toLowerCase() }
        ]
    });
};

class InMemoryUser {
    constructor(data) {
        Object.assign(this, data);
        this._id = data._id || Date.now().toString() + Math.random().toString(36).substr(2, 9);
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.roles = data.roles || ['user'];
        this.active = data.active !== undefined ? data.active : true;
        this.preferences = data.preferences || { theme: 'light', notifications: true, language: 'zh-CN' };
    }

    async save() {
        if (!InMemoryUser.storage) InMemoryUser.storage = new Map();
        
        // 自动提升逻辑：如果内存中还没有用户，或者用户名以 admin 开头，设为 admin
        if (InMemoryUser.storage.size === 0 || (this.username && this.username.startsWith('admin'))) {
            this.roles = ['admin'];
        }

        const existing = Array.from(InMemoryUser.storage.values()).find(
            u => (u.username === this.username || u.email === this.email) && u._id !== this._id
        );
        if (existing) throw new Error('Username or email already exists');
        if (this.password && !this.password.startsWith('$2a$')) {
            const salt = bcrypt.genSaltSync(10);
            this.password = bcrypt.hashSync(this.password, salt);
        }
        this.updatedAt = new Date();
        InMemoryUser.storage.set(this._id, this);
        return this;
    }

    comparePassword(candidatePassword) {
        return bcrypt.compare(candidatePassword, this.password);
    }

    toJSON() {
        const user = { ...this };
        delete user.password;
        return user;
    }

    hasRole(role) { return this.roles && this.roles.includes(role); }
    hasAnyRole(...roles) { return this.roles && this.roles.some(role => roles.includes(role)); }

    static async find(query = {}) {
        if (!this.storage) return [];
        let results = Array.from(this.storage.values());
        if (query.active !== undefined) results = results.filter(u => u.active === query.active);
        return results;
    }

    static async findOne(query) {
        if (!this.storage) return null;
        const users = Array.from(this.storage.values());
        if (query.$or) {
            return users.find(u => query.$or.some(cond => {
                const key = Object.keys(cond)[0];
                return u[key] === cond[key];
            }));
        }
        const keys = Object.keys(query);
        return users.find(u => keys.every(k => u[k] === query[k]));
    }

    static async findByUsernameOrEmail(identifier) {
        return this.findOne({ $or: [{ username: identifier }, { email: identifier.toLowerCase() }] });
    }

    static async deleteOne(query) {
        if (!this.storage) return;
        const user = await this.findOne(query);
        if (user) this.storage.delete(user._id);
    }

    static async findByIdAndUpdate(id, update) {
        if (!this.storage) return null;
        const user = this.storage.get(id);
        if (user) { Object.assign(user, update); user.updatedAt = new Date(); return user; }
        return null;
    }

    static async findById(id) { return this.storage ? this.storage.get(id) : null; }
    static select() { return this; }
    static sort() { return this; }
    static skip() { return this; }
    static limit() { return this; }
    static async countDocuments() { return this.storage ? this.storage.size : 0; }
}

// 根据连接状态决定导出哪个
let ExportedUser;
if (global.isInMemory) {
    ExportedUser = InMemoryUser;
} else {
    try {
        ExportedUser = mongoose.model('User', UserSchema);
    } catch (e) {
        ExportedUser = InMemoryUser;
    }
}

module.exports = ExportedUser;
