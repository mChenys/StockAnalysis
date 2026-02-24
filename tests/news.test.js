const request = require('supertest');
const createApp = require('../src/app');
const mongoose = require('mongoose');

describe('News System API', () => {
    let appInstance;
    let token;

    beforeAll(async () => {
        const { app } = await createApp();
        appInstance = app;

        // 获取管理员令牌
        const username = 'admin_news_' + Date.now();
        await request(appInstance)
            .post('/api/auth/register')
            .send({ username, email: `${username}@example.com`, password: 'password123' });
        
        const loginRes = await request(appInstance)
            .post('/api/auth/login')
            .send({ username, password: 'password123' });
        
        token = loginRes.body.data.accessToken;
    }, 15000);

    afterAll(async () => {
        await mongoose.disconnect();
    });

    it('should ingest news and return stats', async () => {
        const res = await request(appInstance)
            .post('/api/news/ingest')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.stats).toHaveProperty('savedCount');
    }, 60000); // 抓取可能较慢

    it('should get news list', async () => {
        const res = await request(appInstance)
            .get('/api/news')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should get hot topics', async () => {
        const res = await request(appInstance)
            .get('/api/news/topics')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});
