const cron = require('node-cron');
const Task = require('../database/models/Task');
const logger = require('../utils/logger');
const { spawn } = require('child_process');
const path = require('path');

class CronManager {
    constructor() {
        this.jobs = new Map(); // Store cron.schedule objects
    }

    async init() {
        try {
            if (global.isInMemory) {
                // Ignore DB loading if in memory, tasks are empty initially until user creates them.
                logger.info(`In-Memory mode bypass: skipping task loading from DB.`);
                return;
            }
            const tasks = await Task.find({ active: true });
            logger.info(`Found ${tasks.length} active scheduled tasks. Loading...`);
            tasks.forEach(task => this.scheduleTask(task));
        } catch (error) {
            logger.error(`Error initializing cron manager: ${error.message}`);
        }
    }

    scheduleTask(task) {
        if (!cron.validate(task.cronExpression)) {
            logger.error(`Invalid cron expression for task ${task._id}: ${task.cronExpression}`);
            return false;
        }

        // 停止之前的同名任务
        this.stopTask(task._id.toString());

        const job = cron.schedule(task.cronExpression, async () => {
            logger.info(`Running task: ${task.name} (${task.type})`);
            await this.executeTask(task);
        }, {
            scheduled: true,
            timezone: "Asia/Shanghai" // 这里目前为了中国区的时间
        });

        this.jobs.set(task._id.toString(), job);
        logger.info(`Scheduled task [${task.name}] at [${task.cronExpression}]`);
        return true;
    }

    stopTask(taskId) {
        const existingJob = this.jobs.get(taskId);
        if (existingJob) {
            existingJob.stop();
            this.jobs.delete(taskId);
            logger.info(`Successfully stopped previous job instances for task ${taskId}`);
        }
    }

    async executeTask(task) {
        try {
            if (!global.isInMemory) {
                await Task.findByIdAndUpdate(task._id, { lastRunStatus: 'running', lastRunAt: new Date() });
            } else {
                task.lastRunStatus = 'running';
                task.lastRunAt = new Date();
            }
            if (global.io) global.io.emit('task_status_updated', { taskId: task._id.toString(), status: 'running' });

            // 1. 全网热点早晚报
            if (task.type === 'trendradar_report') {
                await this.runTrendRadarScript(task._id.toString());
            }

            // 下方预留其他类型的扩展示例
            else if (task.type === 'market_monitor') {
                logger.info('Running market monitor...');
                // ... 调价格警报逻辑 ...
            }
            else if (task.type === 'weekly_summary') {
                logger.info('Running weekly summary report...');
                // ... 调长文生成逻辑 ...
            }
            else if (task.type === 'model_health') {
                logger.info('Health checking LLMs...');
            }
            else if (task.type === 'data_cleanup') {
                logger.info('Cleaning up database...');
            }

            if (!global.isInMemory) {
                await Task.findByIdAndUpdate(task._id, {
                    lastRunStatus: 'success',
                    lastRunMessage: 'Task executed successfully at ' + new Date().toLocaleString()
                });
            } else {
                task.lastRunStatus = 'success';
                task.lastRunMessage = 'Task executed successfully at ' + new Date().toLocaleString();
            }
            if (global.io) global.io.emit('task_status_updated', { taskId: task._id.toString(), status: 'success' });

        } catch (error) {
            logger.error(`Error executing task ${task.name}: ${error.message}`);
            if (!global.isInMemory) {
                await Task.findByIdAndUpdate(task._id, {
                    lastRunStatus: 'error',
                    lastRunMessage: error.message
                });
            } else {
                task.lastRunStatus = 'error';
                task.lastRunMessage = error.message;
            }
            if (global.io) global.io.emit('task_status_updated', { taskId: task._id.toString(), status: 'error' });
        }
    }

    runTrendRadarScript(taskId) {
        return new Promise((resolve, reject) => {
            const scriptPath = path.resolve(process.cwd(), 'python_service', 'TrendRadar', 'trendradar', '__main__.py');
            const venvPythonPath = path.resolve(process.cwd(), 'python_service', 'venv', 'bin', 'python');

            const nimApiKey = process.env.NVIDIA_NIM_API_KEY || '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';

            logger.info(`TrendRadar Cron Triggering: ${venvPythonPath} ${scriptPath}`);
            const pythonProcess = spawn(venvPythonPath, ['-m', 'trendradar'], {
                cwd: path.resolve(process.cwd(), 'python_service', 'TrendRadar'),
                env: {
                    ...process.env,
                    TRENDRADAR_NO_BROWSER: 'true',
                    AI_API_KEY: nimApiKey
                }
            });

            let out = '';
            pythonProcess.stdout.on('data', data => {
                const chunk = data.toString();
                out += chunk;
                if (chunk.includes('AI分析完成') && global.io) {
                    global.io.emit('trendradar_status', { type: 'progress', message: 'AI 分析已就绪' });
                }
            });
            pythonProcess.stderr.on('data', data => out += data.toString());

            pythonProcess.on('close', code => {
                if (code === 0) {
                    logger.info(`TrendRadar executed successfully by cron.`);
                    if (global.io) global.io.emit('trendradar_status', { type: 'completed' });
                    resolve(out);
                } else {
                    logger.error(`TrendRadar executed with error. Code: ${code} Log: ${out}`);
                    if (global.io) global.io.emit('trendradar_status', { type: 'error', message: `后台任务运行失败 (代码 ${code})` });
                    reject(new Error(`Exit code ${code}. Log excerpt: ${out.substring(0, 500)}`));
                }
            });
        });
    }
}

module.exports = new CronManager();
