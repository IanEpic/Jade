import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Category extends Model {}

Category.init(
  {
    categoryid:       { type: DataTypes.INTEGER,       primaryKey: true, autoIncrement: true },
    programid:        { type: DataTypes.INTEGER },
    name:             { type: DataTypes.STRING(200) },
    shortname:        { type: DataTypes.STRING(50) },
    description:      { type: DataTypes.TEXT },
    entriesopen:      { type: DataTypes.BOOLEAN },
    judgingopen:      { type: DataTypes.BOOLEAN },
    finalistreview:   { type: DataTypes.BOOLEAN },
    winnernomination: { type: DataTypes.BOOLEAN },
    wildcarddecision: { type: DataTypes.BOOLEAN },
    scoreready:       { type: DataTypes.BOOLEAN },
    userid:           { type: DataTypes.INTEGER },
    costex:           { type: DataTypes.DECIMAL(19, 4) },
    gst:              { type: DataTypes.DECIMAL(19, 4) },
    orda:             { type: DataTypes.FLOAT },
    omitfrommobile:   { type: DataTypes.BOOLEAN },
    deleted:          { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Category',
    tableName: 'Category',
    timestamps: false,
  }
);

export default Category;
