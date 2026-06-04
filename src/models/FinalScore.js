import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

// TODO: replace stub columns with full definition from EPIC::JADE::FinalScore Perl model
class FinalScore extends Model {}

FinalScore.init(
  {
    // Stub — add real columns when converting the Perl model
  },
  {
    sequelize,
    modelName: 'FinalScore',
    tableName: 'FinalScore',
    timestamps: false,
  }
);

export default FinalScore;
