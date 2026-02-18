const mysql = require('mysql2');
require('dotenv').config(); // 加载 .env 文件

// 创建连接池 (这是生产环境的标准写法，比 createConnection 更稳定)
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    port: process.env.DB_PORT || 3306,
    password: process.env.DB_PASSWORD, // 会从 .env 读取
    database: process.env.DB_NAME || 'nestsync_user_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 导出 Promise 版本的连接池（为了用 async/await）
module.exports = pool.promise();