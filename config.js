/**
 * 环境配置文件
 * 支持本地开发和公网部署
 */

const config = {
    // 服务器配置
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0'
    },
    
    // WebSocket配置
    websocket: {
        // 自动检测协议和域名
        getSocketUrl: () => {
            if (typeof window !== 'undefined') {
                // 浏览器环境
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                return `${protocol}//${host}`;
            } else {
                // Node.js环境
                const isProduction = process.env.NODE_ENV === 'production';
                const protocol = isProduction ? 'wss:' : 'ws:';
                const host = process.env.WEBSOCKET_URL || 'localhost:3000';
                return `${protocol}//${host}`;
            }
        },
        
        // CORS配置
        cors: {
            origin: process.env.NODE_ENV === 'production' 
                ? [
                    /\.railway\.app$/,
                    /\.render\.com$/,
                    /\.fly\.dev$/,
                    /\.glitch\.me$/,
                    /localhost:\d+$/
                ]
                : "*",
            methods: ["GET", "POST"],
            credentials: true
        }
    },
    
    // 环境检测
    isDevelopment: process.env.NODE_ENV !== 'production',
    isProduction: process.env.NODE_ENV === 'production',
    
    // 数据库配置（如果需要）
    database: {
        // 可以添加数据库配置
    }
};

module.exports = config;