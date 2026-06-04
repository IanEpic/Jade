import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

// This is the Node.js equivalent of EPIC::JADE::DBI.
// It replaces Class::DBI::MSSQL's db_Main() connection method.
// Credentials move from hardcoded values to environment variables.

const sequelize = new Sequelize(
    process.env.DB_NAME || 'Jade',
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        dialect: 'mssql',
        dialectOptions: {
            options: {
                encrypt: false,           // set true if you move to Azure SQL
                trustServerCertificate: true,
                enableArithAbort: true,
            },
        },
        define: {
            timestamps: false,          // your tables manage timestamps manually
            underscored: false,         // columns already lowercase via NAME_lc
            freezeTableName: true,      // prevents Sequelize pluralising table names
        },
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000,
        },
        // LongReadLen equivalent — mssql driver handles large text by default
        // but set this in dialectOptions if you hit truncation issues:
        // requestTimeout: 60000,
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
    }
);

export default sequelize;
