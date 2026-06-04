import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

// TODO: replace stub columns with full definition from EPIC::JADE::Nomination Perl model
class Nomination extends Model {}

Nomination.init(
  {
    // Stub — add real columns when converting the Perl model
  },
  {
    sequelize,
    modelName: 'Nomination',
    tableName: 'Nomination',
    timestamps: false,
  }
);

export default Nomination;
