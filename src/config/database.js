import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
    server: process.env.DB_HOST,
    database: process.env.DB_NAME || 'Jade',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    options: {
        encrypt: false,             // true for Azure SQL, false for self-hosted
        trustServerCertificate: true,
        enableArithAbort: true,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

pool.on('error', (err) => {
    console.error('MSSQL pool error:', err);
});

export async function getPool() {
    await poolConnect;
    return pool;
}

export { sql };
