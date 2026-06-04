import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class CategoryQuestionLink extends Model {}

CategoryQuestionLink.init(
  {
    linkid:     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    categoryid: { type: DataTypes.INTEGER },
    questionid: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'CategoryQuestionLink',
    tableName: 'CategoryQuestionLink',
    timestamps: false,
  }
);

export default CategoryQuestionLink;
