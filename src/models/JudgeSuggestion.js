import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class JudgeSuggestion extends Model {}

JudgeSuggestion.init(
  {},
  {
    sequelize,
    modelName: 'JudgeSuggestion',
    tableName: 'JudgeSuggestion',
    timestamps: false,
  }
);

export default JudgeSuggestion;
