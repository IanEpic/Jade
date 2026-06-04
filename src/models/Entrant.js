import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Entrant extends Model {}

Entrant.init(
  {
    entrantid:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userid:          { type: DataTypes.INTEGER, allowNull: false },
    name:            { type: DataTypes.STRING },
    legalentity:     { type: DataTypes.STRING },
    abn:             { type: DataTypes.STRING },
    type:            { type: DataTypes.STRING },
    streetaddressid: { type: DataTypes.INTEGER },
    postaladdressid: { type: DataTypes.INTEGER },
    telephone:       { type: DataTypes.STRING },
    fax:             { type: DataTypes.STRING },
    mobile:          { type: DataTypes.STRING },
    email:           { type: DataTypes.STRING },
    deleted:         { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Entrant',
    tableName: 'Entrant',
    timestamps: false,
  }
);

export default Entrant;
