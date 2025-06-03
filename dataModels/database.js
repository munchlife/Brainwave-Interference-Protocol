const { Sequelize } = require('sequelize');

// Initialize Sequelize with your PostgreSQL database configuration
const sequelize = new Sequelize({
    dialect: 'postgres', // Use 'postgres' for PostgreSQL
    host: process.env.DB_HOST, // Set in Railway environment variables
    port: process.env.DB_PORT || 5432, // Default to 5432 for PostgreSQL
    username: process.env.DB_USER, // Set in environment variables
    password: process.env.DB_PASSWORD, // Set in environment variables
    database: process.env.DB_NAME, // Set in environment variables
    dialectOptions: {
        ssl: process.env.DB_SSL === 'true', // Optional SSL config for secure connections
    },
    logging: false, // Disable logging for cleaner output
});

console.log(`[DB Config Check] DB_HOST: ${process.env.DB_HOST}, DB_NAME: ${process.env.DB_NAME}`);

// Authenticate the connection to ensure it's working
sequelize.authenticate()
    .then(() => console.log('Database connected successfully'))
    .catch(err => console.error('Unable to connect to the database:', err));

module.exports = sequelize;