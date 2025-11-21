#!/usr/bin/env node

/**
 * 迁安农商银行签到活动 - Socket服务器
 * 连接大屏、手机端和管理后台的WebSocket服务器
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const config = require('./config');

class ActivityServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: config.websocket.cors,
            transports: ['websocket', 'polling'],
            allowEIO3: true,
            credentials: true
        });

        this.port = config.server.port;
        this.host = config.server.host;
        this.isProduction = process.env.NODE_ENV === 'production';
        this.rooms = {
            bigscreen: new Set(),
            phone: new Set(),
            management: new Set()
        };

        this.stats = {
            totalUsers: 0,
            todayCheckins: 0,
            activeHorses: 0,
            totalRedpacks: 0
        };

        this.users = new Map();
        this.checkins = [];
        this.redpackConfig = {
            amounts: [0.88, 1.88, 2.88, 5.88, 8.88, 10.88, 18.88, 28.88],
            totalBudget: 10000,
            usedBudget: 0
        };

        this.init();
    }

    init() {
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.startServer();
        this.startStatsUpdater();
    }

    // 设置中间件
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname)));

        // 日志中间件
        this.app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
            next();
        });
    }

    // 设置路由
    setupRoutes() {
        // 主页路由
        this.app.get('/', (req, res) => {
            res.send(`
                <html>
                <head>
                    <title>迁安农商银行签到活动</title>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        h1 { color: #333; text-align: center; margin-bottom: 30px; }
                        .links { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
                        .link-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-decoration: none; text-align: center; transition: transform 0.3s ease; }
                        .link-card:hover { transform: translateY(-5px); text-decoration: none; color: white; }
                        .stats { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; }
                        .stat-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
                        .status { text-align: center; margin-top: 20px; }
                        .status.online { color: #28a745; }
                        .status.offline { color: #dc3545; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🏦 迁安农商银行签到活动</h1>
                        
                        <div class="links">
                            <a href="/bigscreen.html" class="link-card">
                                <h3>📺 大屏展示</h3>
                                <p>巨型电子屏幕</p>
                            </a>
                            <a href="/phone.html" class="link-card">
                                <h3>📱 手机签到</h3>
                                <p>扫码签到页面</p>
                            </a>
                            <a href="/management.html" class="link-card">
                                <h3>⚙️ 管理后台</h3>
                                <p>活动管理系统</p>
                            </a>
                        </div>
                        
                        <div class="stats">
                            <h3>实时统计</h3>
                            <div class="stat-item">
                                <span>总用户数:</span>
                                <span id="totalUsers">${this.stats.totalUsers}</span>
                            </div>
                            <div class="stat-item">
                                <span>今日签到:</span>
                                <span id="todayCheckins">${this.stats.todayCheckins}</span>
                            </div>
                            <div class="stat-item">
                                <span>活跃骏马:</span>
                                <span id="activeHorses">${this.stats.activeHorses}</span>
                            </div>
                            <div class="stat-item">
                                <span>红包总额:</span>
                                <span id="totalRedpacks">¥${this.stats.totalRedpacks.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        <div class="status online">
                            <h3>✅ 服务器运行中</h3>
                            <p>端口: ${this.port} | 启动时间: ${new Date().toLocaleString()}</p>
                        </div>
                    </div>
                    
                    <script src="/socket.io/socket.io.js"></script>
                    <script>
                        const socket = io();
                        socket.on('stats-update', (stats) => {
                            document.getElementById('totalUsers').textContent = stats.totalUsers;
                            document.getElementById('todayCheckins').textContent = stats.todayCheckins;
                            document.getElementById('activeHorses').textContent = stats.activeHorses;
                            document.getElementById('totalRedpacks').textContent = '¥' + stats.totalRedpacks.toFixed(2);
                        });
                    </script>
                </body>
                </html>
            `);
        });

        // API路由
        this.app.get('/api/stats', (req, res) => {
            res.json(this.stats);
        });

        this.app.get('/api/users', (req, res) => {
            res.json(Array.from(this.users.values()));
        });

        this.app.get('/api/checkins', (req, res) => {
            res.json(this.checkins);
        });

        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                connections: {
                    bigscreen: this.rooms.bigscreen.size,
                    phone: this.rooms.phone.size,
                    management: this.rooms.management.size
                }
            });
        });
    }

    // 设置Socket处理器
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`[Socket] 新连接: ${socket.id}`);

            // 加入房间
            socket.on('join-room', (room) => {
                if (this.rooms[room]) {
                    socket.join(room);
                    this.rooms[room].add(socket.id);
                    socket.room = room;
                    console.log(`[Socket] ${socket.id} 加入房间: ${room}`);

                    // 发送当前统计数据
                    socket.emit('stats-update', this.stats);

                    // 通知管理后台有新连接
                    this.io.to('management').emit('connection-update', {
                        room,
                        action: 'join',
                        socketId: socket.id,
                        connections: this.getRoomConnections()
                    });
                }
            });

            // 处理用户签到
            socket.on('user-checkin', (data) => {
                this.handleUserCheckin(socket, data);
            });

            // 请求统计数据
            socket.on('request-stats', () => {
                socket.emit('stats-update', this.stats);
            });

            // 管理后台操作
            socket.on('admin-action', (data) => {
                this.handleAdminAction(socket, data);
            });

            // 配置更新
            socket.on('config-update', (config) => {
                this.handleConfigUpdate(socket, config);
            });

            // 断开连接
            socket.on('disconnect', () => {
                console.log(`[Socket] 连接断开: ${socket.id}`);

                if (socket.room && this.rooms[socket.room]) {
                    this.rooms[socket.room].delete(socket.id);

                    // 通知管理后台连接断开
                    this.io.to('management').emit('connection-update', {
                        room: socket.room,
                        action: 'leave',
                        socketId: socket.id,
                        connections: this.getRoomConnections()
                    });
                }
            });
        });
    }

    // 处理用户签到
    handleUserCheckin(socket, data) {
        console.log(`[签到] 用户签到:`, data);

        // 生成红包金额
        const redpackAmount = this.generateRedpackAmount();

        // 创建签到记录
        const checkinRecord = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            userId: data.userId,
            userName: data.userName,
            timestamp: data.timestamp || Date.now(),
            location: data.location || '活动现场',
            redpackAmount: redpackAmount,
            status: 'success'
        };

        // 保存用户信息
        this.users.set(data.userId, {
            id: data.userId,
            name: data.userName,
            lastCheckin: checkinRecord.timestamp,
            redpackTotal: (this.users.get(data.userId) && this.users.get(data.userId).redpackTotal || 0) + redpackAmount,
            checkinCount: (this.users.get(data.userId) && this.users.get(data.userId).checkinCount || 0) + 1,
            status: 'active'
        });

        // 保存签到记录
        this.checkins.unshift(checkinRecord);

        // 限制记录数量
        if (this.checkins.length > 1000) {
            this.checkins = this.checkins.slice(0, 1000);
        }

        // 更新统计
        this.updateStats();

        // 通知手机端签到成功
        socket.emit('checkin-success', {
            ...checkinRecord,
            message: '签到成功！您的专属骏马已在大屏上奔腾！'
        });

        // 通知大屏显示骏马
        this.io.to('bigscreen').emit('user-checkin', {
            userId: data.userId,
            userName: data.userName,
            redpackAmount: redpackAmount
        });

        // 通知管理后台
        this.io.to('management').emit('user-checkin', checkinRecord);

        // 广播统计更新
        this.io.emit('stats-update', this.stats);

        console.log(`[签到] 处理完成: ${data.userName} 获得红包 ¥${redpackAmount.toFixed(2)}`);
    }

    // 生成红包金额
    generateRedpackAmount() {
        // 检查预算
        if (this.redpackConfig.usedBudget >= this.redpackConfig.totalBudget) {
            return 0.01; // 预算用完，给最小金额
        }

        // 随机选择金额
        const amount = this.redpackConfig.amounts[
            Math.floor(Math.random() * this.redpackConfig.amounts.length)
        ];

        // 更新已用预算
        this.redpackConfig.usedBudget += amount;

        return amount;
    }

    // 处理管理员操作
    handleAdminAction(socket, data) {
        console.log(`[管理] 管理员操作:`, data);

        switch (data.action) {
            case 'reset-stats':
                this.resetStats();
                this.io.emit('stats-update', this.stats);
                break;

            case 'clear-users':
                this.users.clear();
                this.updateStats();
                this.io.emit('stats-update', this.stats);
                break;

            case 'clear-checkins':
                this.checkins = [];
                this.updateStats();
                this.io.emit('stats-update', this.stats);
                break;

            case 'broadcast-message':
                this.io.emit('system-message', data.message);
                break;
        }
    }

    // 处理配置更新
    handleConfigUpdate(socket, config) {
        console.log(`[配置] 配置更新:`, config);

        if (config.redpack) {
            this.redpackConfig = {
                ...this.redpackConfig,
                ...config.redpack
            };
        }

        // 通知所有客户端配置已更新
        this.io.emit('config-updated', config);
    }

    // 更新统计数据
    updateStats() {
        this.stats = {
            totalUsers: this.users.size,
            todayCheckins: this.getTodayCheckinsCount(),
            activeHorses: this.users.size, // 简化：假设每个用户都有一匹马
            totalRedpacks: this.getTotalRedpackAmount()
        };
    }

    // 获取今日签到数
    getTodayCheckinsCount() {
        const today = new Date().toDateString();
        return this.checkins.filter(checkin =>
            new Date(checkin.timestamp).toDateString() === today
        ).length;
    }

    // 获取红包总额
    getTotalRedpackAmount() {
        return this.checkins.reduce((total, checkin) => total + checkin.redpackAmount, 0);
    }

    // 重置统计
    resetStats() {
        this.stats = {
            totalUsers: 0,
            todayCheckins: 0,
            activeHorses: 0,
            totalRedpacks: 0
        };
        this.users.clear();
        this.checkins = [];
        this.redpackConfig.usedBudget = 0;
    }

    // 获取房间连接数
    getRoomConnections() {
        return {
            bigscreen: this.rooms.bigscreen.size,
            phone: this.rooms.phone.size,
            management: this.rooms.management.size
        };
    }

    // 启动统计更新器
    startStatsUpdater() {
        // 每30秒广播一次统计数据
        setInterval(() => {
            this.updateStats();
            this.io.emit('stats-update', this.stats);
        }, 30000);
    }

    // 启动服务器
    startServer() {
        this.server.listen(this.port, this.host, () => {
            console.log('='.repeat(60));
            console.log('🏦 迁安农商银行签到活动服务器');
            console.log('='.repeat(60));
            console.log(`🚀 服务器启动成功！`);
            console.log(`📡 端口: ${this.port}`);
            console.log(`🌐 访问地址: http://localhost:${this.port}`);
            console.log(`📺 大屏地址: http://localhost:${this.port}/bigscreen.html`);
            console.log(`📱 手机地址: http://localhost:${this.port}/phone.html`);
            console.log(`⚙️  管理地址: http://localhost:${this.port}/management.html`);
            console.log('='.repeat(60));
            console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);
            console.log('📊 等待连接中...');
            console.log('');
        });

        // 优雅关闭
        process.on('SIGINT', () => {
            console.log('\n🛑 正在关闭服务器...');
            this.server.close(() => {
                console.log('✅ 服务器已关闭');
                process.exit(0);
            });
        });

        process.on('SIGTERM', () => {
            console.log('\n🛑 收到终止信号，正在关闭服务器...');
            this.server.close(() => {
                console.log('✅ 服务器已关闭');
                process.exit(0);
            });
        });
    }
}

// 启动服务器
if (require.main === module) {
    new ActivityServer();
}

module.exports = ActivityServer;