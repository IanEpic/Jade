import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Criteria extends Model {}

Criteria.init(
  {
    criteriaid:  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    categoryid:  { type: DataTypes.INTEGER },
    name:        { type: DataTypes.STRING },
    description: { type: DataTypes.TEXT },
    weight:      { type: DataTypes.INTEGER },
    orda:        { type: DataTypes.FLOAT },
  },
  {
    sequelize,
    modelName: 'Criteria',
    tableName: 'Criteria',
    timestamps: false,
  }
);

export default Criteria;
