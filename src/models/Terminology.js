import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Terminology extends Model {}

Terminology.init(
  {
    terminologyid: { type: DataTypes.INTEGER,    primaryKey: true, autoIncrement: true },
    programid:     { type: DataTypes.STRING(10) },
    word:          { type: DataTypes.STRING(100) },
    replacement:   { type: DataTypes.STRING(100) },
    orda:          { type: DataTypes.FLOAT },
  },
  {
    sequelize,
    modelName: 'Terminology',
    tableName: 'Terminology',
    timestamps: false,
  }
);

export default Terminology;
