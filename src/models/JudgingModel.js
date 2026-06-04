import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class JudgingModel extends Model {}

JudgingModel.init(
  {},
  {
    sequelize,
    modelName: 'JudgingModel',
    tableName: 'JudgingModel',
    timestamps: false,
  }
);

export default JudgingModel;
