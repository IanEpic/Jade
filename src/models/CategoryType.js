import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class CategoryType extends Model {}

CategoryType.init(
  {
    categorytypeid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    programid:      { type: DataTypes.INTEGER },
    name:           { type: DataTypes.STRING(100) },
    orda:           { type: DataTypes.FLOAT },
    rules:          { type: DataTypes.TEXT },
    feedsto:        { type: DataTypes.INTEGER, allowNull: true },
    deleted:        { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'CategoryType',
    tableName: 'CategoryType',
    timestamps: false,
  }
);

export default CategoryType;
