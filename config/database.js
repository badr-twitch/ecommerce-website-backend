const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const useSsl = process.env.DB_SSL !== 'false';
const useDirectHost = process.env.DB_USE_DIRECT === 'true';

const dialectOptions = useSsl
  ? {
      ssl: {
        require: true,
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      },
    }
  : {};

const host = useDirectHost
  ? (process.env.DB_HOST_DIRECT || process.env.DB_HOST || 'localhost')
  : (process.env.DB_HOST || 'localhost');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'ecommerce_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    dialectOptions,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

module.exports = sequelize; 