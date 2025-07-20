import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create a connection pool for Neon PostgreSQL
export const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon
    },
    // Neon-optimized settings
    max: 5, // Reduced for serverless (Neon recommends 5-10)
    idleTimeoutMillis: 10000, // 10 seconds
    connectionTimeoutMillis: 5000, // 5 seconds timeout
    allowExitOnIdle: true, // Important for serverless
});

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client:', err);
});

// Test the connection
// Enhanced connection test
export const testConnection = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('✅ Neon database connected successfully');

        // Test vector extension
        const result = await client.query('SELECT NOW(), version()');
        console.log('Database time:', result.rows[0].now);

        // Verify pgvector extension
        const vectorCheck = await client.query(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        );
        console.log('pgvector available:', vectorCheck.rows[0].exists);

    } catch (err) {
        console.error('❌ Neon database connection failed:', err.message);
        throw err;
    } finally {
        if (client) client.release();
    }
};

export default pool;
