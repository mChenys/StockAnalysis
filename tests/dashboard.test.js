const request = require('supertest');
const createApp = require('../src/app');
const mongoose = require('mongoose');

describe('Dashboard API', () => {
    let appInstance;
    let token;

    beforeAll(async () => {
        const { app } = await createApp();
        appInstance = app;

        const username = 'admin_dash_' + Date.now();
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

    it('should return valid dashboard statistics', async () => {
        const res = await request(appInstance)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('activeModels');
        expect(res.body).toHaveProperty('todayAnalysis');
    });

    it('should update active models count after adding a model', async () => {
        // 先获取初始值
        const initialRes = await request(appInstance)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`);
        const initialCount = initialRes.body.activeModels;

        // 添加一个有效的 Mock 模型配置 (Provider 设为 mock 以通过连接测试)
        await request(appInstance)
            .post('/api/models')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'NewMock_' + Date.now(),
                provider: 'mock',
                apiKey: 'none',
                model: 'mock-1.0',
                active: true
            });

        // 再次获取
        const finalRes = await request(appInstance)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`);
        
        expect(finalRes.body.activeModels).toEqual(initialCount + 1);
    });
});
