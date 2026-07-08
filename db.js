const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Kranthi@77',
  database: process.env.DB_NAME || 'stripe_demo',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Execute a SQL query
 * @param {string} sql 
 * @param {any[]} [params] 
 * @returns {Promise<any>}
 */
async function query(sql, params) {
  const [results] = await pool.execute(sql, params);
  return results;
}

/**
 * Run a callback function within a MySQL transaction
 * @param {function(mysql.PoolConnection): Promise<any>} callback 
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction
};
