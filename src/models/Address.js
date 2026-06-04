import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Address extends Model {}

Address.init(
  {
    addressid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userid:    { type: DataTypes.INTEGER, allowNull: false },
    address:   { type: DataTypes.STRING },
    city:      { type: DataTypes.STRING },
    state:     { type: DataTypes.STRING },
    code:      { type: DataTypes.STRING },
    country:   { type: DataTypes.STRING },
    deleted:   { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Address',
    tableName: 'Address',
    timestamps: false,
  }
);

export default Address;
