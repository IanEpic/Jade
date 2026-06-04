import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class CategoryEligibilityLink extends Model {}

CategoryEligibilityLink.init(
  {
    linkid:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    categoryid:    { type: DataTypes.INTEGER },
    eligibilityid: { type: DataTypes.INTEGER },
    orda:          { type: DataTypes.FLOAT },
  },
  {
    sequelize,
    modelName: 'CategoryEligibilityLink',
    tableName: 'CategoryEligibilityLink',
    timestamps: false,
  }
);

export default CategoryEligibilityLink;
