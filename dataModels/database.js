// dataModels/database.js
const { Sequelize } = require('sequelize');

// Initialize Sequelize with your SQLite database configuration (or another DB)
const sequelize = new Sequelize({
    dialect: 'sqlite', // Change this to 'mysql', 'postgres', etc., if you're using another DB
    storage: './database.sqlite', // Path to your SQLite file
});

sequelize.authenticate()
    .then(() => console.log('Database connected successfully'))
    .catch(err => console.error('Unable to connect to the database:', err));

module.exports = sequelize;
