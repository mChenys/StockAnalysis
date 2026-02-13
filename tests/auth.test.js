const request = require('supertest');
const createApp = require('../src/app');
const mongoose = require('mongoose');

describe('Authentication API', () => {
    let appInstance;

    beforeAll(async () => {
        const { app } = await createApp();
        appInstance = app;
    }, 15000); // 增加初始化超时时间

    afterAll(async () => {
        await mongoose.disconnect();
    });

    it('should register a new user', async () => {
        const res = await request(appInstance)
            .post('/api/auth/register')
            .send({
                username: 'testuser_' + Date.now(),
                email: `test_${Date.now()}@example.com`,
                password: 'password123'
            });
        
        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
    });

    it('should login an existing user', async () => {
        const username = 'loginuser_' + Date.now();
        const password = 'password123';
        
        // 先注册
        await request(appInstance)
            .post('/api/auth/register')
            .send({ username, email: `${username}@example.com`, password });

        const res = await request(appInstance)
            .post('/api/auth/login')
            .send({ username, password });
        
        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should fail login with wrong password', async () => {
        const username = 'wrongpassuser_' + Date.now();
        await request(appInstance)
            .post('/api/auth/register')
            .send({ username, email: `${username}@example.com`, password: 'password123' });

        const res = await request(appInstance)
            .post('/api/auth/login')
            .send({
                username,
                password: 'wrongpassword'
            });
        
        expect(res.statusCode).toEqual(401);
        expect(res.body.success).toBe(false);
    });
});
