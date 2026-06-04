import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Eligibility extends Model {}

Eligibility.init(
  {
    eligibilityid:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    programid:       { type: DataTypes.INTEGER },
    eligibilityrule: { type: DataTypes.TEXT },
    allcats:         { type: DataTypes.BOOLEAN },
    orda:            { type: DataTypes.FLOAT },
    deleted:         { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Eligibility',
    tableName: 'Eligibility',
    timestamps: false,
  }
);

export default Eligibility;
