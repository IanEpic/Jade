import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class JudgeCategoryLink extends Model {}

JudgeCategoryLink.init(
  {
    linkid:     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userid:     { type: DataTypes.INTEGER },
    categoryid: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'JudgeCategoryLink',
    tableName: 'JudgeCategoryLink',
    timestamps: false,
  }
);

export default JudgeCategoryLink;
