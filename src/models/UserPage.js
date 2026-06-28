import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class UserPage extends Model {}

UserPage.init(
  {
    userpageid:  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    programid:   { type: DataTypes.INTEGER },
    name:        { type: DataTypes.STRING },
    html:        { type: DataTypes.TEXT },
    show4user:   { type: DataTypes.BOOLEAN },
    show4judge:  { type: DataTypes.BOOLEAN },
    show4admin:  { type: DataTypes.BOOLEAN },
    withsidebar: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, modelName: 'UserPage', tableName: 'UserPage', timestamps: false }
);

export default UserPage;
