import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class TopMenu extends Model {}

TopMenu.init(
  {
    topmenuid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  },
  { sequelize, modelName: 'TopMenu', tableName: 'TopMenu', timestamps: false }
);

export default TopMenu;
