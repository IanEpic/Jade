import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Response extends Model {}

Response.init(
  {
    responseid:  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entryid:     { type: DataTypes.INTEGER },
    questionid:  { type: DataTypes.INTEGER },
    value:       { type: DataTypes.TEXT },
    caption:     { type: DataTypes.TEXT },
    deleted:     { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, modelName: 'Response', tableName: 'Response', timestamps: false }
);

export default Response;
