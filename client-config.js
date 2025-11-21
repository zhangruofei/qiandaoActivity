/**
 * 客户端Socket.io配置
 * 自动适配HTTP/HTTPS和WS/WSS
 */

function getSocketConfig() {
    // 自动检测协议
    const isSecure = window.location.protocol === 'https:';
    const host = window.location.host;
    
    return {
        // Socket.io会自动选择协议 (ws/wss)
        url: window.location.origin,
        options: {
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            timeout: 20000,
            forceNew: false,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            maxReconnectionAttempts: 5,
            randomizationFactor: 0.5
        }
    };
}

// 创建Socket连接的辅助函数
function createSocket() {
    const config = getSocketConfig();
    console.log('连接到:', config.url);
    
    const socket = io(config.url, config.options);
    
    // 连接事件监听
    socket.on('connect', () => {
        console.log('✅ Socket连接成功:', socket.id);
        console.log('🔒 使用协议:', window.location.protocol === 'https:' ? 'WSS' : 'WS');
    });
    
    socket.on('disconnect', (reason) => {
        console.log('❌ Socket连接断开:', reason);
    });
    
    socket.on('connect_error', (error) => {
        console.error('🚫 Socket连接错误:', error);
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Socket重连成功，尝试次数:', attemptNumber);
    });
    
    socket.on('reconnect_error', (error) => {
        console.error('🔄 Socket重连失败:', error);
    });
    
    return socket;
}

// 导出配置（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getSocketConfig, createSocket };
}
